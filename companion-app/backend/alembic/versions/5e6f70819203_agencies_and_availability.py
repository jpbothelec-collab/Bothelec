"""agencies (users.agency_name/agency_code) and profile availability

Additive, nullable, idempotent (ADD COLUMN IF NOT EXISTS) — safe on both a
freshly-built schema and an existing database.

Revision ID: 5e6f70819203
Revises: 4d5e6f708192
Create Date: 2026-09-03

"""
from alembic import op

revision = "5e6f70819203"
down_revision = "4d5e6f708192"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS agency_name TEXT")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS agency_code TEXT")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_agency_code ON users(agency_code)"
    )
    op.execute(
        "ALTER TABLE companion_profiles ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT FALSE"
    )
    op.execute(
        "ALTER TABLE companion_profiles ADD COLUMN IF NOT EXISTS availability_bumped_at TIMESTAMPTZ"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE companion_profiles DROP COLUMN IF EXISTS availability_bumped_at")
    op.execute("ALTER TABLE companion_profiles DROP COLUMN IF EXISTS is_available")
    op.execute("DROP INDEX IF EXISTS uq_users_agency_code")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS agency_code")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS agency_name")
