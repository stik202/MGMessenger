"""add is_notifications_muted to users

Revision ID: 20250314_add_is_notif_muted
Revises:
Create Date: 2026-03-14
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision = "20250314_add_is_notif_muted"
down_revision = None
branch_labels = None
depends_on = None


def _column_exists(conn) -> bool:
    return (
        conn.execute(
            text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = :table AND column_name = :column"
            ),
            {"table": "users", "column": "is_notifications_muted"},
        ).first()
        is not None
    )


def upgrade() -> None:
    conn = op.get_bind()
    if not _column_exists(conn):
        op.add_column(
            "users",
            sa.Column(
                "is_notifications_muted",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )


def downgrade() -> None:
    conn = op.get_bind()
    if _column_exists(conn):
        op.drop_column("users", "is_notifications_muted")
