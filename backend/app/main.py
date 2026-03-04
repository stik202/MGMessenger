from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.api.deps import decode_login_from_token
from app.api.routes import router
from app.core.config import settings
from app.db.models import GroupMember, Message, User
from app.db.session import AsyncSessionLocal


app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

uploads = Path(settings.upload_dir)
uploads.mkdir(parents=True, exist_ok=True)

app.include_router(router)


def _extract_token(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip()
    return request.query_params.get("token")


async def _can_read_message_file(login: str, msg: Message) -> bool:
    async with AsyncSessionLocal() as db:
        user = await db.scalar(select(User).where(User.login == login))
        if not user or user.is_blocked:
            return False
        if msg.group_id:
            member = await db.scalar(
                select(GroupMember.id).where(
                    GroupMember.group_id == msg.group_id,
                    GroupMember.user_id == user.id,
                )
            )
            return member is not None
        return user.id in {msg.sender_id, msg.receiver_user_id}


@app.get("/uploads/{file_name:path}")
async def get_upload(file_name: str, request: Request):
    # block path traversal
    uploads_root = uploads.resolve()
    target = (uploads / file_name).resolve()
    if uploads_root not in target.parents and target != uploads_root:
        raise HTTPException(status_code=400, detail="Invalid file path")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    relative_url = f"/uploads/{file_name}"
    async with AsyncSessionLocal() as db:
        msg = await db.scalar(
            select(Message)
            .where(
                (Message.file_url == relative_url)
                | (Message.file_url.like(f"%{relative_url}"))
            )
            .order_by(Message.created_at.desc())
            .limit(1)
        )

    # Public files (e.g., avatars) are still available without auth.
    if not msg:
        return FileResponse(target)

    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")
    try:
        login = decode_login_from_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc
    if not await _can_read_message_file(login, msg):
        raise HTTPException(status_code=403, detail="No access to this file")
    return FileResponse(target)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
