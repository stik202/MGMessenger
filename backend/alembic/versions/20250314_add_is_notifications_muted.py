"""add is_notifications_muted to users

Revision ID: 20250314_add_is_notifications_muted
Revises: 
Create Date: 2026-03-14
"""

from alembic import op
import sqlalchemy as sa


revision = "20250314_add_is_notifications_muted"
down_revision = ""
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_notifications_muted", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("users", "is_notifications_muted")
