from sqlalchemy import select

from app.core.security import hash_password
from app.db.base import Base
from app.db.models import User
from app.db.session import AsyncSessionLocal, engine


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

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

