from collections.abc import Sequence

from app.db.models import User


def build_display_name(user: User) -> str:
    parts: Sequence[str] = [user.first_name.strip(), user.last_name.strip()]
    full = " ".join(p for p in parts if p)
    return full or user.login

