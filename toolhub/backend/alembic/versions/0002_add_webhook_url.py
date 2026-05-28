"""0002 — add webhook_url to tools (already present in initial schema)

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # webhook_url already included in 0001 initial migration
    pass


def downgrade() -> None:
    pass
