"""featured listings (paid boost)

Adds companion_profiles.featured_until — while in the future the profile is
"featured" and floats to the top of Browse.

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
Create Date: 2026-09-05

"""
from alembic import op

revision = "c6d7e8f9a0b1"
down_revision = "b5c6d7e8f9a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE companion_profiles ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ")


def downgrade() -> None:
    op.execute("ALTER TABLE companion_profiles DROP COLUMN IF EXISTS featured_until")
