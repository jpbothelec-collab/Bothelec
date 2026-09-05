"""structured profile details (JSONB)

Adds companion_profiles.details — a JSON object of listing attributes
(main heading, area, age, build, height, hair colour, eyes, language,
smoker, body art, star sign, likes, dislikes, premises & parking) that
replaces the single free-text bio in the UI.

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
Create Date: 2026-09-05

"""
from alembic import op

revision = "b5c6d7e8f9a0"
down_revision = "a4b5c6d7e8f9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE companion_profiles ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}'")


def downgrade() -> None:
    op.execute("ALTER TABLE companion_profiles DROP COLUMN IF EXISTS details")
