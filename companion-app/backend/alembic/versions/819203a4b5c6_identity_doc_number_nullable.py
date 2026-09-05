"""make identity_documents.document_number_enc nullable

The ID-verification flow uploads a document image and captures consent; it
does not collect an ID number at submission (any number is read later during
review, into extracted_* fields). The column was NOT NULL, so every
submission failed with a not-null violation. Make it nullable.

Revision ID: 819203a4b5c6
Revises: 708192a3b4c5
Create Date: 2026-09-05

"""
from alembic import op

revision = "819203a4b5c6"
down_revision = "708192a3b4c5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent: DROP NOT NULL on an already-nullable column is a no-op.
    op.execute("ALTER TABLE identity_documents ALTER COLUMN document_number_enc DROP NOT NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE identity_documents ALTER COLUMN document_number_enc SET NOT NULL")
