"""0001 — tables initiales ToolHub

Revision ID: 0001
Revises:
Create Date: 2026-05-28
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tool_categories",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_tool_categories_slug", "tool_categories", ["slug"])

    op.create_table(
        "tools",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("category_id", sa.String(36), sa.ForeignKey("tool_categories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("integration_type", sa.Enum("api", "mcp", "webhook", name="integration_type_enum"), nullable=False, server_default="api"),
        sa.Column("config_schema", sa.JSON, nullable=True),
        sa.Column("cache_ttl", sa.Integer, nullable=False, server_default="0"),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="1"),
        sa.Column("webhook_url", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_tools_name", "tools", ["name"])
    op.create_index("ix_tools_category_id", "tools", ["category_id"])

    op.create_table(
        "user_tool_credentials",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(255), nullable=False),
        sa.Column("tool_id", sa.String(36), sa.ForeignKey("tools.id", ondelete="CASCADE"), nullable=False),
        sa.Column("credentials_encrypted", sa.Text, nullable=False),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_user_tool_credentials_user_id", "user_tool_credentials", ["user_id"])
    op.create_index("ix_user_tool_credentials_composite", "user_tool_credentials", ["user_id", "tool_id"])

    op.create_table(
        "tool_executions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tool_id", sa.String(36), sa.ForeignKey("tools.id", ondelete="SET NULL"), nullable=True),
        sa.Column("user_id", sa.String(255), nullable=False),
        sa.Column("action", sa.String(255), nullable=False),
        sa.Column("request_payload", sa.JSON, nullable=True),
        sa.Column("status", sa.Enum("success", "error", "cached", "disabled", name="execution_status_enum"), nullable=False),
        sa.Column("error_detail", sa.Text, nullable=True),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("from_cache", sa.Boolean, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_tool_executions_user_id", "tool_executions", ["user_id"])
    op.create_index("ix_tool_executions_tool_id", "tool_executions", ["tool_id"])
    op.create_index("ix_tool_executions_created_at", "tool_executions", ["created_at"])


def downgrade() -> None:
    op.drop_table("tool_executions")
    op.drop_table("user_tool_credentials")
    op.drop_table("tools")
    op.drop_table("tool_categories")
