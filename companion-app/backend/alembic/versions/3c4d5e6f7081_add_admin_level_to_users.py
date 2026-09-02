"""add admin_level tier to users

Adds the admin access tier column used to subdivide the previously
all-or-nothing admin role (see app/services/admin_access.py). NULL means
full/legacy access, so existing admins are unaffected.

Additive, nullable, idempotent (ADD COLUMN IF NOT EXISTS) — safe on both a
freshly-built schema (the initial revision runs migrations/001_initial_schema.sql,
which now also declares this column) and an older database.

Revision ID: 3c4d5e6f7081
Revises: 2b3c4d5e6f70
Create Date: 2026-09-02

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "3c4d5e6f7081"
down_revision = "2b3c4d5e6f70"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_level TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS admin_level")
