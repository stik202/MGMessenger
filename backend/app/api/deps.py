from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.deps import get_db
from app.db.models import User


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        login = payload.get("sub")
        if not login:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    user = await db.scalar(select(User).where(User.login == login))
    if not user:
        raise credentials_exception
    return user

