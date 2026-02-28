from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password
from app.db.deps import get_db
from app.db.models import ChatGroup, GroupMember, Message, User
from app.schemas.chat import (
    ActiveChatsOut,
    ChangePasswordIn,
    GroupCreateIn,
    GroupShort,
    GroupUpdateIn,
    LoginIn,
    MessageOut,
    TokenOut,
    UserProfile,
    UserProfileUpdate,
    UserShort,
)
from app.services.utils import build_display_name


router = APIRouter(prefix="/api")


@router.post("/auth/login", response_model=TokenOut)
async def login(payload: LoginIn, db: AsyncSession = Depends(get_db)) -> TokenOut:
    user = await db.scalar(select(User).where(User.login == payload.login.strip()))
    if not user or not verify_password(payload.password, user.password_hash):
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
    stmt = select(User).where(User.id != current_user.id).order_by(User.first_name, User.last_name, User.login)
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


@router.get("/chats/active", response_model=ActiveChatsOut)
async def active_chats(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
) -> ActiveChatsOut:
    msg_stmt = select(Message).where(
        or_(Message.sender_id == current_user.id, Message.receiver_user_id == current_user.id)
    )
    msgs = (await db.scalars(msg_stmt)).all()

    partner_ids: set[UUID] = set()
    for msg in msgs:
        if msg.sender_id == current_user.id and msg.receiver_user_id:
            partner_ids.add(msg.receiver_user_id)
        if msg.receiver_user_id == current_user.id:
            partner_ids.add(msg.sender_id)

    users_out: list[UserShort] = []
    if partner_ids:
        users = (await db.scalars(select(User).where(User.id.in_(partner_ids)))).all()
        users_out = [
            UserShort(
                id=u.id,
                login=u.login,
                name=build_display_name(u),
                avatar_url=u.avatar_url,
                phone=u.phone,
                email=u.email,
                position=u.position,
            )
            for u in users
        ]

    groups_stmt = (
        select(ChatGroup)
        .join(GroupMember, GroupMember.group_id == ChatGroup.id)
        .where(GroupMember.user_id == current_user.id)
        .options(selectinload(ChatGroup.members).selectinload(GroupMember.user), selectinload(ChatGroup.owner))
    )
    groups = (await db.scalars(groups_stmt)).all()

    groups_out = [
        GroupShort(
            id=g.id,
            name=g.name,
            avatar_url=g.avatar_url,
            owner_login=g.owner.login,
            members=[gm.user.login for gm in g.members],
        )
        for g in groups
    ]

    return ActiveChatsOut(users=users_out, groups=groups_out)


@router.get("/messages", response_model=list[MessageOut])
async def get_messages(
    chat_type: str,
    target: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MessageOut]:
    if chat_type == "private":
        partner = await db.scalar(select(User).where(User.login == target))
        if not partner:
            raise HTTPException(status_code=404, detail="Пользователь не найден")

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

        stmt = (
            select(Message)
            .options(selectinload(Message.sender))
            .where(Message.group_id == group_id)
            .order_by(Message.created_at)
        )
    else:
        raise HTTPException(status_code=400, detail="chat_type должен быть private или group")

    rows = (await db.scalars(stmt)).all()
    out: list[MessageOut] = []
    for row in rows:
        out.append(
            MessageOut(
                id=row.id,
                sender=build_display_name(row.sender),
                text=row.text,
                file_url=row.file_url,
                is_image=row.file_mime.startswith("image/"),
                is_mine=row.sender_id == current_user.id,
                time=row.created_at.strftime("%H:%M") if row.created_at else "",
                created_at=row.created_at,
            )
        )
    return out


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

    msg = Message(sender_id=current_user.id, text=text.strip(), file_url=file_url, file_mime=file_mime)
    if chat_type == "private":
        partner = await db.scalar(select(User).where(User.login == target))
        if not partner:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        msg.receiver_user_id = partner.id
    elif chat_type == "group":
        group_id = UUID(target)
        membership = await db.scalar(
            select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == current_user.id)
        )
        if not membership:
            raise HTTPException(status_code=403, detail="Нет доступа к группе")
        msg.group_id = group_id
    else:
        raise HTTPException(status_code=400, detail="chat_type должен быть private или group")

    db.add(msg)
    await db.commit()
    return {"status": "success"}


@router.post("/groups", response_model=GroupShort)
async def create_group(
    payload: GroupCreateIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GroupShort:
    member_logins = set(payload.members)
    member_logins.add(current_user.login)

    members = (await db.scalars(select(User).where(User.login.in_(list(member_logins))))).all()
    if not members:
        raise HTTPException(status_code=400, detail="Участники не найдены")

    group = ChatGroup(name=payload.name.strip(), owner_id=current_user.id)
    db.add(group)
    await db.flush()

    for u in members:
        db.add(GroupMember(group_id=group.id, user_id=u.id))

    await db.commit()

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
    members = (await db.scalars(select(User).where(User.login.in_(list(member_logins))))).all()
    await db.execute(GroupMember.__table__.delete().where(GroupMember.group_id == group_id))

    for u in members:
        db.add(GroupMember(group_id=group.id, user_id=u.id))

    group.name = payload.name.strip()
    group.avatar_url = payload.avatar_url.strip()

    await db.commit()
    return GroupShort(
        id=group.id,
        name=group.name,
        avatar_url=group.avatar_url,
        owner_login=current_user.login,
        members=[u.login for u in members],
    )


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


