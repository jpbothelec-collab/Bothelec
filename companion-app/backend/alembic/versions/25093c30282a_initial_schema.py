"""initial schema

Revision ID: 25093c30282a
Revises:
Create Date: 2026-09-01

"""
from pathlib import Path

from alembic import op

# revision identifiers, used by Alembic.
revision = "25093c30282a"
down_revision = None
branch_labels = None
depends_on = None

_SCHEMA_SQL_PATH = Path(__file__).resolve().parents[2] / "migrations" / "001_initial_schema.sql"


def upgrade() -> None:
    sql = _SCHEMA_SQL_PATH.read_text()
    op.execute(sql)


def downgrade() -> None:
    # Drop in dependency order (children before parents).
    op.execute("DROP TABLE IF EXISTS audit_log")
    op.execute("DROP TABLE IF EXISTS reviews")
    op.execute("DROP TABLE IF EXISTS messages")
    op.execute("DROP TABLE IF EXISTS conversations")
    op.execute("DROP TABLE IF EXISTS bookings")
    op.execute("DROP TABLE IF EXISTS subscriptions")
    op.execute("DROP TABLE IF EXISTS portfolio_media")
    op.execute("DROP TABLE IF EXISTS companion_profiles")
    op.execute("DROP TABLE IF EXISTS identity_documents")
    op.execute("DROP TABLE IF EXISTS users")
    op.execute("DROP TYPE IF EXISTS companionship_category")
    op.execute("DROP TYPE IF EXISTS booking_status")
    op.execute("DROP TYPE IF EXISTS subscription_status")
    op.execute("DROP TYPE IF EXISTS verification_status")
    op.execute("DROP TYPE IF EXISTS user_role")
