"""companion price-list document

Additive, nullable, idempotent (ADD COLUMN IF NOT EXISTS).

Revision ID: 708192a3b4c5
Revises: 6f708192a3b4
Create Date: 2026-09-03

"""
from alembic import op

revision = "708192a3b4c5"
down_revision = "6f708192a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE companion_profiles ADD COLUMN IF NOT EXISTS price_list_path TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE companion_profiles DROP COLUMN IF EXISTS price_list_path")
