"""agency branding assets: background image + price list

Additive, nullable, idempotent (ADD COLUMN IF NOT EXISTS).

Revision ID: 6f708192a3b4
Revises: 5e6f70819203
Create Date: 2026-09-03

"""
from alembic import op

revision = "6f708192a3b4"
down_revision = "5e6f70819203"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS agency_background_path TEXT")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS agency_price_list_path TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS agency_price_list_path")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS agency_background_path")
