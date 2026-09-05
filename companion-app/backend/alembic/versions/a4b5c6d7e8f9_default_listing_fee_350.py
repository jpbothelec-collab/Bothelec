"""default listing fee R350 per profile

Sets the column default to 35000 cents (R350) for new profiles, and bumps
any existing profiles still on the old R0 default up to R350.

Revision ID: a4b5c6d7e8f9
Revises: 819203a4b5c6
Create Date: 2026-09-05

"""
from alembic import op

revision = "a4b5c6d7e8f9"
down_revision = "819203a4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE companion_profiles ALTER COLUMN monthly_listing_fee_cents SET DEFAULT 35000")
    op.execute("UPDATE companion_profiles SET monthly_listing_fee_cents = 35000 WHERE monthly_listing_fee_cents = 0")


def downgrade() -> None:
    op.execute("ALTER TABLE companion_profiles ALTER COLUMN monthly_listing_fee_cents SET DEFAULT 0")
