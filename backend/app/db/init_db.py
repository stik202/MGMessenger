import re

from sqlalchemy import select, text

from app.core.security import hash_password
from app.db.base import Base
from app.db.models import ChatGroup, Message, User
from app.db.session import AsyncSessionLocal, engine


async def ensure_columns() -> None:
    statements = [
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT FALSE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT TRUE",
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE",
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from_login VARCHAR(128) DEFAULT ''",
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from_name VARCHAR(255) DEFAULT ''",
        """
        CREATE TABLE IF NOT EXISTS contact_invites (
            id UUID PRIMARY KEY,
            token VARCHAR(128) UNIQUE NOT NULL,
            creator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            used_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL,
            used_at TIMESTAMPTZ NULL
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_contact_invites_token ON contact_invites(token)",
    ]
    async with engine.begin() as conn:
        for sql in statements:
            await conn.execute(text(sql))


def _mojibake_score(s: str) -> int:
    if not s:
        return 0
    markers = ["Р", "С", "Ѓ", "Ђ", "Љ", "Њ", "Ў", "ў", "ќ", "ћ", "џ", "Ð", "Ñ", "�"]
    return sum(s.count(x) for x in markers)


def _repair_text(value: str) -> str:
    if not value:
        return value
    source_score = _mojibake_score(value)
    best = value
    best_score = source_score

    for encoding in ["latin1", "cp1251"]:
        try:
            candidate = value.encode(encoding, errors="strict").decode("utf-8", errors="strict")
        except Exception:
            continue
        if not candidate:
            continue
        candidate_score = _mojibake_score(candidate)
        if candidate_score < best_score and re.search(r"[А-Яа-яЁё]", candidate):
            best = candidate
            best_score = candidate_score

    if best != value:
        return best
    return value


async def repair_mojibake_data() -> None:
    async with AsyncSessionLocal() as session:
        users = (await session.scalars(select(User))).all()
        groups = (await session.scalars(select(ChatGroup))).all()
        messages = (await session.scalars(select(Message))).all()

        changed = False
        for u in users:
            for field in ["login", "first_name", "last_name", "middle_name", "position", "phone", "email"]:
                src = getattr(u, field) or ""
                fixed = _repair_text(src)
                if fixed != src:
                    setattr(u, field, fixed)
                    changed = True

        for g in groups:
            src = g.name or ""
            fixed = _repair_text(src)
            if fixed != src:
                g.name = fixed
                changed = True

        for m in messages:
            src = m.text or ""
            fixed = _repair_text(src)
            if fixed != src:
                m.text = fixed
                changed = True

        if changed:
            await session.commit()


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    await ensure_columns()
    await repair_mojibake_data()

    async with AsyncSessionLocal() as session:
        admin = await session.scalar(select(User).where(User.login == "admin"))
        if not admin:
            session.add(
                User(
                    login="admin",
                    password_hash=hash_password("1234"),
                    role="Admin",
                    first_name="Admin",
                    last_name="MG",
                )
            )
            await session.commit()


