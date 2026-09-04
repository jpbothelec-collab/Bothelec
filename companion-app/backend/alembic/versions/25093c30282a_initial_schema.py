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
    _execute_script(sql)


def _execute_script(sql: str) -> None:
    """Run a multi-statement SQL script.

    The initial schema is a single file with many statements. asyncpg (used
    for the app's async engine) sends every query as a prepared statement,
    which PostgreSQL restricts to one command — so ``op.execute(sql)`` fails
    with "cannot insert multiple commands into a prepared statement". asyncpg
    can run a whole script through its simple-query protocol (the same path
    ``psql -f`` uses), so when we're on asyncpg we hand the blob to the raw
    driver connection. Synchronous drivers (psycopg2/psycopg) accept the
    multi-statement blob via ``op.execute`` directly.
    """
    bind = op.get_bind()
    driver_conn = getattr(bind.connection, "driver_connection", None)
    # asyncpg connections expose an ``execute`` coroutine; run it through the
    # greenlet bridge that alembic's run_sync context already provides.
    if driver_conn is not None and driver_conn.__class__.__module__.startswith("asyncpg"):
        from sqlalchemy.util import await_only

        await_only(driver_conn.execute(sql))
    else:
        op.execute(sql)


def downgrade() -> None:
    # Drop in dependency order (children before parents).
    op.execute("DROP TABLE IF EXISTS audit_log")
    op.execute("DROP TABLE IF EXISTS user_reports")
    op.execute("DROP TABLE IF EXISTS reviews")
    op.execute("DROP TABLE IF EXISTS messages")
    op.execute("DROP TABLE IF EXISTS conversations")
    op.execute("DROP TABLE IF EXISTS bookings")
    op.execute("DROP TABLE IF EXISTS subscriptions")
    op.execute("DROP TABLE IF EXISTS portfolio_media")
    op.execute("DROP TABLE IF EXISTS companion_profiles")
    op.execute("DROP TABLE IF EXISTS identity_documents")
    op.execute("DROP TABLE IF EXISTS users")
    op.execute("DROP TYPE IF EXISTS report_status")
    op.execute("DROP TYPE IF EXISTS companionship_category")
    op.execute("DROP TYPE IF EXISTS booking_status")
    op.execute("DROP TYPE IF EXISTS subscription_status")
    op.execute("DROP TYPE IF EXISTS verification_status")
    op.execute("DROP TYPE IF EXISTS user_role")
