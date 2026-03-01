from datetime import datetime, timedelta, timezone
from pathlib import Path
from secrets import token_urlsafe
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import decode_login_from_token, get_admin_user, get_current_user
from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password
from app.db.deps import get_db
from app.db.models import ChatGroup, ContactInvite, GroupMember, Message, User, UserNote
from app.db.session import AsyncSessionLocal
from app.schemas.chat import (
    ActiveChatsOut,
    AdminUserBlockIn,
    AdminUserCreateIn,
    AdminUserOut,
    AdminUserUpdateIn,
    ChangePasswordIn,
    CallInviteIn,
    ContactInviteOpenOut,
    ContactShareIn,
    ContactShareOut,
    GroupCreateIn,
    GroupOwnerTransferIn,
    GroupShort,
    GroupUpdateIn,
    LoginIn,
    MessageEditIn,
    MessageForwardIn,
    MessageOut,
    TokenOut,
    UserInfoOut,
    UserNoteIn,
    UserNoteOut,
    UserProfile,
    UserProfileUpdate,
    UserShort,
)
from app.services.realtime import realtime_hub
from app.services.utils import build_display_name


router = APIRouter(prefix="/api")


def _preview(msg: Message, me_id: UUID) -> str:
    base = msg.text.strip()
    if not base and msg.file_url:
        base = "Файл"
    if msg.sender_id == me_id:
        return f"Вы: {base}" if base else "Вы: сообщение"
    return base or "Сообщение"


def _to_admin_user(u: User) -> AdminUserOut:
    return AdminUserOut(
        id=u.id,
        login=u.login,
        role=u.role,
        name=build_display_name(u),
        first_name=u.first_name,
        last_name=u.last_name,
        middle_name=u.middle_name,
        phone=u.phone,
        email=u.email,
        position=u.position,
        avatar_url=u.avatar_url,
        is_blocked=u.is_blocked,
        is_visible=u.is_visible,
        created_at=u.created_at,
    )


async def _message_participants_logins(db: AsyncSession, msg: Message) -> list[str]:
    if msg.group_id:
        members = (
            await db.scalars(
                select(User.login)
                .join(GroupMember, GroupMember.user_id == User.id)
                .where(GroupMember.group_id == msg.group_id)
            )
        ).all()
        return list(set(members))

    ids = [msg.sender_id]
    if msg.receiver_user_id:
        ids.append(msg.receiver_user_id)
    users = (await db.scalars(select(User.login).where(User.id.in_(ids)))).all()
    return list(set(users))


def _event_preview(text: str, file_url: str) -> str:
    preview = text.strip()
    if not preview and file_url:
        preview = "Файл"
    return preview or "Сообщение"


@router.post("/auth/login", response_model=TokenOut)
async def login(payload: LoginIn, db: AsyncSession = Depends(get_db)) -> TokenOut:
    user = await db.scalar(select(User).where(User.login == payload.login.strip()))
    if not user or user.is_blocked or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Неверный логин или пароль")

    token = create_access_token(user.login)
    return TokenOut(access_token=token, profile=UserProfile.model_validate(user))


@router.post("/auth/change-password")
async def change_password(
    payload: ChangePasswordIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if len(payload.new_password) < 4 or len(payload.new_password) > 64:
        raise HTTPException(status_code=400, detail="Пароль должен быть от 4 до 64 символов")

    current_user.password_hash = hash_password(payload.new_password)
    await db.commit()
    return {"status": "success"}


@router.get("/me", response_model=UserProfile)
async def me(current_user: User = Depends(get_current_user)) -> UserProfile:
    return UserProfile.model_validate(current_user)


@router.put("/me", response_model=UserProfile)
async def update_me(
    payload: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfile:
    current_user.avatar_url = payload.avatar_url
    current_user.phone = payload.phone
    current_user.email = payload.email
    current_user.position = payload.position
    current_user.last_name = payload.last_name
    current_user.first_name = payload.first_name
    current_user.middle_name = payload.middle_name

    await db.commit()
    await db.refresh(current_user)
    return UserProfile.model_validate(current_user)


@router.get("/users/search", response_model=list[UserShort])
async def search_users(
    q: str = "",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[UserShort]:
    stmt = (
        select(User)
        .where(User.id != current_user.id, User.is_blocked.is_(False), User.is_visible.is_(True))
        .order_by(User.first_name, User.last_name, User.login)
    )
    users = (await db.scalars(stmt)).all()

    normalized = q.lower().strip()
    result: list[UserShort] = []
    for u in users:
        name = build_display_name(u)
        haystack = f"{name} {u.middle_name} {u.phone} {u.email} {u.login}".lower()
        if normalized and normalized not in haystack:
            continue
        result.append(
            UserShort(
                id=u.id,
                login=u.login,
                name=name,
                avatar_url=u.avatar_url,
                phone=u.phone,
                email=u.email,
                position=u.position,
            )
        )
    return result


@router.get("/users/{login}", response_model=UserInfoOut)
async def get_user_info(
    login: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserInfoOut:
    user = await db.scalar(select(User).where(User.login == login, User.is_blocked.is_(False)))
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    note = await db.scalar(
        select(UserNote.note).where(
            UserNote.owner_user_id == current_user.id,
            UserNote.target_user_id == user.id,
        )
    )
    return UserInfoOut(
        id=user.id,
        login=user.login,
        name=build_display_name(user),
        avatar_url=user.avatar_url,
        phone=user.phone,
        email=user.email,
        position=user.position,
        note=note or "",
    )


@router.put("/users/{login}/note", response_model=UserNoteOut)
async def set_user_note(
    login: str,
    payload: UserNoteIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserNoteOut:
    user = await db.scalar(select(User).where(User.login == login, User.is_blocked.is_(False)))
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя добавить заметку о себе")

    normalized = payload.note.strip()
    row = await db.scalar(
        select(UserNote).where(
            UserNote.owner_user_id == current_user.id,
            UserNote.target_user_id == user.id,
        )
    )
    if normalized:
        if row:
            row.note = normalized
        else:
            db.add(UserNote(owner_user_id=current_user.id, target_user_id=user.id, note=normalized))
    elif row:
        await db.delete(row)

    await db.commit()
    return UserNoteOut(note=normalized)


@router.get("/chats/active", response_model=ActiveChatsOut)
async def active_chats(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> ActiveChatsOut:
    private_msgs = (
        await db.scalars(
            select(Message)
            .where(or_(Message.sender_id == current_user.id, Message.receiver_user_id == current_user.id), Message.group_id.is_(None))
            .order_by(Message.created_at)
        )
    ).all()

    partner_ids: set[UUID] = set()
    for msg in private_msgs:
        if msg.sender_id == current_user.id and msg.receiver_user_id:
            partner_ids.add(msg.receiver_user_id)
        if msg.receiver_user_id == current_user.id:
            partner_ids.add(msg.sender_id)

    users_map: dict[UUID, User] = {}
    if partner_ids:
        users = (await db.scalars(select(User).where(User.id.in_(partner_ids), User.is_blocked.is_(False)))).all()
        users_map = {u.id: u for u in users}

    private_last: dict[UUID, Message] = {}
    private_unread: dict[UUID, int] = {uid: 0 for uid in users_map}
    for msg in private_msgs:
        partner_id = msg.receiver_user_id if msg.sender_id == current_user.id else msg.sender_id
        if partner_id not in users_map:
            continue
        private_last[partner_id] = msg
        if msg.receiver_user_id == current_user.id and not msg.is_read and msg.sender_id != current_user.id:
            private_unread[partner_id] = private_unread.get(partner_id, 0) + 1

    users_out = []
    for pid, u in users_map.items():
        last = private_last.get(pid)
        users_out.append(
            UserShort(
                id=u.id,
                login=u.login,
                name=build_display_name(u),
                avatar_url=u.avatar_url,
                phone=u.phone,
                email=u.email,
                position=u.position,
                unread_count=private_unread.get(pid, 0),
                last_message=_preview(last, current_user.id) if last else "",
                last_time=last.created_at.strftime("%H:%M") if last and last.created_at else "",
            )
        )

    groups = (
        await db.scalars(
            select(ChatGroup)
            .join(GroupMember, GroupMember.group_id == ChatGroup.id)
            .where(GroupMember.user_id == current_user.id)
            .options(selectinload(ChatGroup.members).selectinload(GroupMember.user), selectinload(ChatGroup.owner))
        )
    ).all()

    groups_out: list[GroupShort] = []
    for g in groups:
        last = await db.scalar(select(Message).where(Message.group_id == g.id).order_by(Message.created_at.desc()).limit(1))
        unread = await db.scalar(
            select(func.count(Message.id)).where(
                Message.group_id == g.id,
                Message.sender_id != current_user.id,
                Message.is_read.is_(False),
            )
        )
        groups_out.append(
            GroupShort(
                id=g.id,
                name=g.name,
                avatar_url=g.avatar_url,
                owner_login=g.owner.login,
                members=[gm.user.login for gm in g.members],
                unread_count=int(unread or 0),
                last_message=_preview(last, current_user.id) if last else "",
                last_time=last.created_at.strftime("%H:%M") if last and last.created_at else "",
            )
        )

    users_out.sort(key=lambda x: x.last_time, reverse=True)
    groups_out.sort(key=lambda x: x.last_time, reverse=True)
    return ActiveChatsOut(users=users_out, groups=groups_out)


@router.get("/messages", response_model=list[MessageOut])
async def get_messages(
    chat_type: str,
    target: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MessageOut]:
    if chat_type == "private":
        partner = await db.scalar(select(User).where(User.login == target, User.is_blocked.is_(False)))
        if not partner:
            raise HTTPException(status_code=404, detail="Пользователь не найден")

        await db.execute(
            Message.__table__.update()
            .where(
                Message.sender_id == partner.id,
                Message.receiver_user_id == current_user.id,
                Message.group_id.is_(None),
                Message.is_read.is_(False),
            )
            .values(is_read=True)
        )
        await db.commit()

        stmt = (
            select(Message)
            .options(selectinload(Message.sender))
            .where(
                Message.group_id.is_(None),
                or_(
                    and_(Message.sender_id == current_user.id, Message.receiver_user_id == partner.id),
                    and_(Message.sender_id == partner.id, Message.receiver_user_id == current_user.id),
                ),
            )
            .order_by(Message.created_at)
        )
    elif chat_type == "group":
        group_id = UUID(target)
        membership = await db.scalar(
            select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id)
        )
        if not membership:
            raise HTTPException(status_code=403, detail="Нет доступа к группе")

        await db.execute(
            Message.__table__.update()
            .where(Message.group_id == group_id, Message.sender_id != current_user.id, Message.is_read.is_(False))
            .values(is_read=True)
        )
        await db.commit()

        stmt = (
            select(Message)
            .options(selectinload(Message.sender))
            .where(Message.group_id == group_id)
            .order_by(Message.created_at)
        )
    else:
        raise HTTPException(status_code=400, detail="chat_type должен быть private или group")

    rows = (await db.scalars(stmt)).all()
    return [
        MessageOut(
            id=row.id,
            sender=build_display_name(row.sender),
            text=row.text,
            file_url=row.file_url,
            is_image=row.file_mime.startswith("image/"),
            forwarded_from_login=row.forwarded_from_login or "",
            forwarded_from_name=row.forwarded_from_name or "",
            is_mine=row.sender_id == current_user.id,
            is_read=row.is_read,
            time=row.created_at.strftime("%H:%M") if row.created_at else "",
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post("/messages")
async def send_message(
    chat_type: str = Form(...),
    target: str = Form(...),
    text: str = Form(""),
    file: UploadFile | None = File(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not text and not file:
        raise HTTPException(status_code=400, detail="Пустое сообщение")

    file_url = ""
    file_mime = ""
    if file:
        upload_root = Path(settings.upload_dir)
        upload_root.mkdir(parents=True, exist_ok=True)
        suffix = Path(file.filename or "").suffix
        safe_name = f"{uuid4()}{suffix}" if suffix else str(uuid4())
        target_path = upload_root / safe_name
        content = await file.read()
        target_path.write_bytes(content)
        file_url = f"{settings.upload_base_url.rstrip('/')}/{safe_name}"
        file_mime = file.content_type or "application/octet-stream"

    msg = Message(sender_id=current_user.id, text=text.strip(), file_url=file_url, file_mime=file_mime, is_read=False)
    notify_logins = [current_user.login]

    if chat_type == "private":
        partner = await db.scalar(select(User).where(User.login == target, User.is_blocked.is_(False)))
        if not partner:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        msg.receiver_user_id = partner.id
        notify_logins.append(partner.login)
    elif chat_type == "group":
        group_id = UUID(target)
        membership = await db.scalar(
            select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id)
        )
        if not membership:
            raise HTTPException(status_code=403, detail="Нет доступа к группе")
        msg.group_id = group_id
        members = (
            await db.scalars(
                select(User.login)
                .join(GroupMember, GroupMember.user_id == User.id)
                .where(GroupMember.group_id == group_id)
            )
        ).all()
        notify_logins.extend(members)
    else:
        raise HTTPException(status_code=400, detail="chat_type должен быть private или group")

    db.add(msg)
    await db.commit()

    await realtime_hub.notify_users(
        list(set(notify_logins)),
        {
            "type": "message:new",
            "chat_type": chat_type,
            "target": target,
            "sender_login": current_user.login,
            "sender_name": build_display_name(current_user),
            "preview": _event_preview(msg.text, msg.file_url),
        },
    )
    return {"status": "success"}


@router.put("/messages/{message_id}")
async def edit_message(
    message_id: UUID,
    payload: MessageEditIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    msg = await db.scalar(select(Message).where(Message.id == message_id))
    if not msg:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Можно редактировать только свои сообщения")

    new_text = payload.text.strip()
    if not new_text and not msg.file_url:
        raise HTTPException(status_code=400, detail="Пустое сообщение")
    msg.text = new_text
    await db.commit()

    participants = await _message_participants_logins(db, msg)
    await realtime_hub.notify_users(
        participants,
        {
            "type": "message:update",
            "chat_type": "group" if msg.group_id else "private",
            "target": str(msg.group_id or msg.receiver_user_id or ""),
            "sender_login": current_user.login,
            "sender_name": build_display_name(current_user),
            "preview": _event_preview(msg.text, msg.file_url),
        },
    )
    return {"status": "success"}


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    msg = await db.scalar(select(Message).where(Message.id == message_id))
    if not msg:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Можно удалять только свои сообщения")

    participants = await _message_participants_logins(db, msg)
    chat_type = "group" if msg.group_id else "private"
    target = str(msg.group_id or msg.receiver_user_id or "")
    await db.delete(msg)
    await db.commit()
    await realtime_hub.notify_users(participants, {"type": "message:delete", "chat_type": chat_type, "target": target})
    return {"status": "success"}


@router.post("/messages/{message_id}/forward")
async def forward_message(
    message_id: UUID,
    payload: MessageForwardIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    source = await db.scalar(select(Message).options(selectinload(Message.sender)).where(Message.id == message_id))
    if not source:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    if source.group_id:
        membership = await db.scalar(
            select(GroupMember).where(GroupMember.group_id == source.group_id, GroupMember.user_id == current_user.id)
        )
        if not membership:
            raise HTTPException(status_code=403, detail="Нет доступа к сообщению")
    elif source.sender_id != current_user.id and source.receiver_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Нет доступа к сообщению")

    forwarded = Message(
        sender_id=current_user.id,
        text=source.text,
        file_url=source.file_url,
        file_mime=source.file_mime,
        forwarded_from_login=source.sender.login if source.sender else "",
        forwarded_from_name=build_display_name(source.sender) if source.sender else "",
        is_read=False,
    )
    notify_logins = [current_user.login]

    if payload.chat_type == "private":
        partner = await db.scalar(select(User).where(User.login == payload.target, User.is_blocked.is_(False)))
        if not partner:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        forwarded.receiver_user_id = partner.id
        notify_logins.append(partner.login)
    elif payload.chat_type == "group":
        group_id = UUID(payload.target)
        membership = await db.scalar(
            select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id)
        )
        if not membership:
            raise HTTPException(status_code=403, detail="Нет доступа к группе")
        forwarded.group_id = group_id
        members = (
            await db.scalars(
                select(User.login)
                .join(GroupMember, GroupMember.user_id == User.id)
                .where(GroupMember.group_id == group_id)
            )
        ).all()
        notify_logins.extend(members)
    else:
        raise HTTPException(status_code=400, detail="chat_type должен быть private или group")

    db.add(forwarded)
    await db.commit()
    await realtime_hub.notify_users(
        list(set(notify_logins)),
        {
            "type": "message:new",
            "chat_type": payload.chat_type,
            "target": payload.target,
            "sender_login": current_user.login,
            "sender_name": build_display_name(current_user),
            "preview": _event_preview(forwarded.text, forwarded.file_url),
        },
    )
    return {"status": "success"}


@router.post("/groups", response_model=GroupShort)
async def create_group(
    payload: GroupCreateIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GroupShort:
    member_logins = set(payload.members)
    member_logins.add(current_user.login)

    members = (await db.scalars(select(User).where(User.login.in_(list(member_logins)), User.is_blocked.is_(False)))).all()
    if not members:
        raise HTTPException(status_code=400, detail="Участники не найдены")

    group = ChatGroup(name=payload.name.strip(), owner_id=current_user.id)
    db.add(group)
    await db.flush()

    for u in members:
        db.add(GroupMember(group_id=group.id, user_id=u.id))

    await db.commit()
    await realtime_hub.notify_users([u.login for u in members], {"type": "chat:update"})

    return GroupShort(
        id=group.id,
        name=group.name,
        avatar_url=group.avatar_url,
        owner_login=current_user.login,
        members=[u.login for u in members],
    )


@router.put("/groups/{group_id}", response_model=GroupShort)
async def update_group(
    group_id: UUID,
    payload: GroupUpdateIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GroupShort:
    group = await db.scalar(select(ChatGroup).where(ChatGroup.id == group_id).options(selectinload(ChatGroup.owner)))
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только владелец может редактировать группу")

    member_logins = set(payload.members)
    member_logins.add(current_user.login)
    members = (await db.scalars(select(User).where(User.login.in_(list(member_logins)), User.is_blocked.is_(False)))).all()
    await db.execute(GroupMember.__table__.delete().where(GroupMember.group_id == group_id))

    for u in members:
        db.add(GroupMember(group_id=group.id, user_id=u.id))

    group.name = payload.name.strip()
    group.avatar_url = payload.avatar_url.strip()

    await db.commit()
    await realtime_hub.notify_users([u.login for u in members], {"type": "chat:update"})

    return GroupShort(
        id=group.id,
        name=group.name,
        avatar_url=group.avatar_url,
        owner_login=current_user.login,
        members=[u.login for u in members],
    )


@router.post("/groups/{group_id}/owner", response_model=GroupShort)
async def transfer_group_owner(
    group_id: UUID,
    payload: GroupOwnerTransferIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GroupShort:
    group = await db.scalar(
        select(ChatGroup)
        .where(ChatGroup.id == group_id)
        .options(selectinload(ChatGroup.owner), selectinload(ChatGroup.members).selectinload(GroupMember.user))
    )
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только владелец может передать права")

    new_owner = await db.scalar(select(User).where(User.login == payload.new_owner_login, User.is_blocked.is_(False)))
    if not new_owner:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if not any(m.user_id == new_owner.id for m in group.members):
        raise HTTPException(status_code=400, detail="Новый владелец должен быть участником группы")

    group.owner_id = new_owner.id
    await db.commit()
    await db.refresh(group)
    await db.refresh(new_owner)

    member_logins = [m.user.login for m in group.members]
    await realtime_hub.notify_users(member_logins, {"type": "chat:update"})
    return GroupShort(
        id=group.id,
        name=group.name,
        avatar_url=group.avatar_url,
        owner_login=new_owner.login,
        members=member_logins,
    )


@router.delete("/groups/{group_id}")
async def delete_group(
    group_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    group = await db.scalar(
        select(ChatGroup)
        .where(ChatGroup.id == group_id)
        .options(selectinload(ChatGroup.members).selectinload(GroupMember.user))
    )
    if not group:
        raise HTTPException(status_code=404, detail="Группа не найдена")
    if group.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только владелец может удалить группу")

    member_logins = [m.user.login for m in group.members]
    await db.delete(group)
    await db.commit()
    await realtime_hub.notify_users(member_logins, {"type": "chat:update"})
    return {"status": "success"}


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> dict:
    _ = current_user
    upload_root = Path(settings.upload_dir)
    upload_root.mkdir(parents=True, exist_ok=True)

    suffix = Path(file.filename or "").suffix
    safe_name = f"{uuid4()}{suffix}" if suffix else str(uuid4())
    target_path = upload_root / safe_name

    content = await file.read()
    target_path.write_bytes(content)

    return {"url": f"{settings.upload_base_url.rstrip('/')}/{safe_name}"}


@router.get("/admin/users", response_model=list[AdminUserOut])
async def admin_users(
    q: str = "",
    _: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[AdminUserOut]:
    rows = (await db.scalars(select(User).order_by(User.created_at.desc()))).all()
    qn = q.lower().strip()
    if qn:
        rows = [
            u for u in rows if qn in f"{u.login} {u.first_name} {u.last_name} {u.phone} {u.email}".lower()
        ]
    return [_to_admin_user(u) for u in rows]


@router.post("/admin/users", response_model=AdminUserOut)
async def admin_create_user(
    payload: AdminUserCreateIn,
    _: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserOut:
    exists = await db.scalar(select(User).where(User.login == payload.login.strip()))
    if exists:
        raise HTTPException(status_code=400, detail="Логин уже занят")

    u = User(
        login=payload.login.strip(),
        password_hash=hash_password(payload.password),
        role=payload.role,
        first_name=payload.first_name,
        last_name=payload.last_name,
        middle_name=payload.middle_name,
        phone=payload.phone,
        email=payload.email,
        position=payload.position,
        is_visible=payload.is_visible,
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return _to_admin_user(u)


@router.put("/admin/users/{user_id}", response_model=AdminUserOut)
async def admin_update_user(
    user_id: UUID,
    payload: AdminUserUpdateIn,
    _: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserOut:
    u = await db.scalar(select(User).where(User.id == user_id))
    if not u:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    if payload.id and payload.id != u.id:
        linked = await db.scalar(
            select(func.count(Message.id)).where(
                or_(Message.sender_id == u.id, Message.receiver_user_id == u.id)
            )
        )
        group_links = await db.scalar(
            select(func.count(GroupMember.id)).where(GroupMember.user_id == u.id)
        )
        owns_groups = await db.scalar(
            select(func.count(ChatGroup.id)).where(ChatGroup.owner_id == u.id)
        )
        if int(linked or 0) > 0 or int(group_links or 0) > 0 or int(owns_groups or 0) > 0:
            raise HTTPException(
                status_code=400,
                detail="Нельзя менять ID пользователя, у которого уже есть сообщения/группы",
            )
        exists_id = await db.scalar(select(User).where(User.id == payload.id))
        if exists_id:
            raise HTTPException(status_code=400, detail="ID уже занят")
        u.id = payload.id

    if payload.login is not None and payload.login.strip() and payload.login.strip() != u.login:
        exists_login = await db.scalar(select(User).where(User.login == payload.login.strip()))
        if exists_login:
            raise HTTPException(status_code=400, detail="Логин уже занят")
        u.login = payload.login.strip()

    for field in ["role", "first_name", "last_name", "middle_name", "phone", "email", "position", "avatar_url", "is_visible"]:
        value = getattr(payload, field)
        if value is not None:
            setattr(u, field, value)

    if payload.is_blocked is not None:
        u.is_blocked = payload.is_blocked

    if payload.password:
        u.password_hash = hash_password(payload.password)

    await db.commit()
    await db.refresh(u)
    return _to_admin_user(u)


@router.post("/contacts/share", response_model=ContactShareOut)
async def share_contact(
    payload: ContactShareIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContactShareOut:
    target = await db.scalar(select(User).where(User.login == payload.target_login, User.is_blocked.is_(False)))
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    invite = ContactInvite(
        token=token_urlsafe(32),
        creator_user_id=current_user.id,
        target_user_id=target.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=3),
    )
    db.add(invite)
    await db.commit()
    return ContactShareOut(token=invite.token, path=f"/?invite={invite.token}")


@router.post("/contacts/invite/{token}", response_model=ContactInviteOpenOut)
async def open_contact_invite(
    token: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ContactInviteOpenOut:
    invite = await db.scalar(select(ContactInvite).where(ContactInvite.token == token))
    if not invite:
        raise HTTPException(status_code=404, detail="Ссылка не найдена")
    if invite.used_at is not None:
        raise HTTPException(status_code=400, detail="Ссылка уже использована")
    if invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Срок действия ссылки истек")
    if invite.target_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя открыть ссылку на самого себя")

    target = await db.scalar(select(User).where(User.id == invite.target_user_id, User.is_blocked.is_(False)))
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь недоступен")

    invite.used_at = datetime.now(timezone.utc)
    invite.used_by_user_id = current_user.id
    await db.commit()
    return ContactInviteOpenOut(
        login=target.login,
        name=build_display_name(target),
        avatar_url=target.avatar_url,
        phone=target.phone,
        email=target.email,
        position=target.position,
    )


@router.post("/calls/invite")
async def invite_call(
    payload: CallInviteIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    target = await db.scalar(select(User).where(User.login == payload.target_login, User.is_blocked.is_(False)))
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя звонить самому себе")

    await realtime_hub.notify_users(
        [target.login],
        {
            "type": "call:invite",
            "from_login": current_user.login,
            "from_name": build_display_name(current_user),
        },
    )
    return {"status": "success"}


@router.post("/admin/users/{user_id}/block", response_model=AdminUserOut)
async def admin_block_user(
    user_id: UUID,
    payload: AdminUserBlockIn,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdminUserOut:
    u = await db.scalar(select(User).where(User.id == user_id))
    if not u:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if u.id == admin.id and payload.is_blocked:
        raise HTTPException(status_code=400, detail="Нельзя заблокировать самого себя")

    u.is_blocked = payload.is_blocked
    await db.commit()
    await db.refresh(u)
    return _to_admin_user(u)


@router.websocket("/ws/events")
async def ws_events(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return

    try:
        login = decode_login_from_token(token)
    except ValueError:
        await websocket.close(code=1008)
        return

    async with AsyncSessionLocal() as db:
        user = await db.scalar(select(User).where(User.login == login))
        if not user or user.is_blocked:
            await websocket.close(code=1008)
            return

    await realtime_hub.connect_events(login, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        realtime_hub.disconnect_events(login, websocket)


@router.websocket("/ws/calls/{room_id}")
async def ws_calls(websocket: WebSocket, room_id: str):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008)
        return

    try:
        login = decode_login_from_token(token)
    except ValueError:
        await websocket.close(code=1008)
        return

    async with AsyncSessionLocal() as db:
        user = await db.scalar(select(User).where(User.login == login))
        if not user or user.is_blocked:
            await websocket.close(code=1008)
            return

    await realtime_hub.connect_call(room_id, websocket)
    try:
        while True:
            msg = await websocket.receive_text()
            await realtime_hub.broadcast_call(room_id, websocket, msg)
    except WebSocketDisconnect:
        realtime_hub.disconnect_call(room_id, websocket)





