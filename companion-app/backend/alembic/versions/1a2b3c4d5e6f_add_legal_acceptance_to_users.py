"""add legal (ToS / Privacy Policy) acceptance capture to users

Adds per-user record of Terms of Service and Privacy Policy acceptance:
when the user accepted and which document version. Additive and nullable
so it applies cleanly to databases already carrying user rows.

Uses ADD COLUMN IF NOT EXISTS because the initial revision executes the
hand-written migrations/001_initial_schema.sql, which now also declares
these columns for fresh installs — this revision then no-ops on a
freshly-built schema and backfills the columns on an older one.

Revision ID: 1a2b3c4d5e6f
Revises: 25093c30282a
Create Date: 2026-09-02

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "1a2b3c4d5e6f"
down_revision = "25093c30282a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS tos_accepted_at TIMESTAMPTZ")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS tos_version TEXT")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_version TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS privacy_version")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS privacy_accepted_at")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS tos_version")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS tos_accepted_at")
