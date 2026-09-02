"""add ID-document processing consent capture to identity_documents

Records POPIA special-personal-information consent per ID submission:
when consent was given and which version of the consent notice was shown.
Separate from the ToS/Privacy acceptance on the users row.

Additive, nullable, and idempotent (ADD COLUMN IF NOT EXISTS) so it is
safe on both a freshly-built schema (the initial revision executes
migrations/001_initial_schema.sql, which now also declares these columns)
and an older database already carrying identity_documents rows.

Revision ID: 2b3c4d5e6f70
Revises: 1a2b3c4d5e6f
Create Date: 2026-09-02

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "2b3c4d5e6f70"
down_revision = "1a2b3c4d5e6f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE identity_documents ADD COLUMN IF NOT EXISTS consent_given_at TIMESTAMPTZ"
    )
    op.execute(
        "ALTER TABLE identity_documents ADD COLUMN IF NOT EXISTS consent_version TEXT"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE identity_documents DROP COLUMN IF EXISTS consent_version")
    op.execute("ALTER TABLE identity_documents DROP COLUMN IF EXISTS consent_given_at")
