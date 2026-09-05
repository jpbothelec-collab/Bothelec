"""banner ads table

Third-party banner advertisements, managed by admins and shown in a
placement slot (e.g. the Browse page).

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1
Create Date: 2026-09-05

"""
from alembic import op

revision = "d7e8f9a0b1c2"
down_revision = "c6d7e8f9a0b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS banner_ads (
            id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            title        TEXT NOT NULL,
            image_path   TEXT NOT NULL,
            link_url     TEXT,
            placement    TEXT NOT NULL DEFAULT 'browse',
            is_active    BOOLEAN NOT NULL DEFAULT TRUE,
            sort_order   INTEGER NOT NULL DEFAULT 0,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_banner_ads_active ON banner_ads(placement, is_active)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS banner_ads")
