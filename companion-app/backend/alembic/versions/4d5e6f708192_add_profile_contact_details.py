"""add contact_details to companion_profiles

Free-text contact details a lister may publish on their profile. Additive,
nullable, idempotent (ADD COLUMN IF NOT EXISTS) so it is safe on both a
freshly-built schema and an existing database.

Revision ID: 4d5e6f708192
Revises: 3c4d5e6f7081
Create Date: 2026-09-03

"""
from alembic import op

revision = "4d5e6f708192"
down_revision = "3c4d5e6f7081"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE companion_profiles ADD COLUMN IF NOT EXISTS contact_details TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE companion_profiles DROP COLUMN IF EXISTS contact_details")
