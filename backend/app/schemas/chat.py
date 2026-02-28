from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    profile: "UserProfile"


class LoginIn(BaseModel):
    login: str
    password: str


class ChangePasswordIn(BaseModel):
    new_password: str


class UserProfileUpdate(BaseModel):
    avatar_url: str = ""
    phone: str = ""
    email: str = ""
    position: str = ""
    last_name: str = ""
    first_name: str = ""
    middle_name: str = ""


class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    login: str
    avatar_url: str
    phone: str
    email: str
    position: str
    role: str
    last_name: str
    first_name: str
    middle_name: str


class UserShort(BaseModel):
    id: UUID
    login: str
    name: str
    avatar_url: str
    phone: str
    email: str
    position: str
    is_group: bool = False


class GroupShort(BaseModel):
    id: UUID
    name: str
    avatar_url: str
    owner_login: str
    members: list[str]
    is_group: bool = True


class ActiveChatsOut(BaseModel):
    users: list[UserShort]
    groups: list[GroupShort]


class MessageOut(BaseModel):
    id: UUID
    sender: str
    text: str
    file_url: str
    is_image: bool
    is_mine: bool
    time: str
    created_at: datetime


class GroupCreateIn(BaseModel):
    name: str
    members: list[str]


class GroupUpdateIn(BaseModel):
    name: str
    avatar_url: str = ""
    members: list[str]


TokenOut.model_rebuild()

