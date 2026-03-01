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
    is_blocked: bool
    is_visible: bool


class UserShort(BaseModel):
    id: UUID
    login: str
    name: str
    avatar_url: str
    phone: str
    email: str
    position: str
    unread_count: int = 0
    last_message: str = ""
    last_time: str = ""
    is_group: bool = False


class UserInfoOut(UserShort):
    note: str = ""


class GroupShort(BaseModel):
    id: UUID
    name: str
    avatar_url: str
    owner_login: str
    members: list[str]
    unread_count: int = 0
    last_message: str = ""
    last_time: str = ""
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
    forwarded_from_login: str = ""
    forwarded_from_name: str = ""
    is_mine: bool
    is_read: bool
    time: str
    created_at: datetime


class GroupCreateIn(BaseModel):
    name: str
    members: list[str]


class GroupUpdateIn(BaseModel):
    name: str
    avatar_url: str = ""
    members: list[str]


class GroupOwnerTransferIn(BaseModel):
    new_owner_login: str


class AdminUserCreateIn(BaseModel):
    login: str
    password: str
    role: str = "User"
    first_name: str = ""
    last_name: str = ""
    middle_name: str = ""
    phone: str = ""
    email: str = ""
    position: str = ""
    is_visible: bool = True


class AdminUserUpdateIn(BaseModel):
    id: UUID | None = None
    login: str | None = None
    role: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    middle_name: str | None = None
    phone: str | None = None
    email: str | None = None
    position: str | None = None
    avatar_url: str | None = None
    is_blocked: bool | None = None
    is_visible: bool | None = None
    password: str | None = None


class AdminUserBlockIn(BaseModel):
    is_blocked: bool


class AdminUserOut(BaseModel):
    id: UUID
    login: str
    role: str
    name: str
    first_name: str
    last_name: str
    middle_name: str
    phone: str
    email: str
    position: str
    avatar_url: str
    is_blocked: bool
    is_visible: bool
    created_at: datetime


class CallInviteIn(BaseModel):
    target_login: str


class UserNoteIn(BaseModel):
    note: str = ""


class UserNoteOut(BaseModel):
    note: str = ""


class MessageEditIn(BaseModel):
    text: str = ""


class MessageForwardIn(BaseModel):
    chat_type: str
    target: str


class ContactShareIn(BaseModel):
    target_login: str


class ContactShareOut(BaseModel):
    token: str
    path: str


class ContactInviteOpenOut(BaseModel):
    login: str
    name: str
    avatar_url: str
    phone: str
    email: str
    position: str


TokenOut.model_rebuild()
