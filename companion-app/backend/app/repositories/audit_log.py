from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import AuditLog


async def write(
    db: AsyncSession,
    *,
    actor_id: UUID | None,
    action: str,
    target_type: str,
    target_id: UUID | None,
    metadata: dict | None = None,
) -> AuditLog:
    """
    Records an admin/system action for the audit trail. Called from
    anywhere a consequential decision is made — user suspension, report
    resolution, confirmed message violations, auto-unpublish on lapsed
    billing — so there's always a record of who (or what job) did what,
    even though the action itself is executed by the calling code.
    """
    entry = AuditLog(
        actor_id=actor_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        log_metadata=metadata,
    )
    db.add(entry)
    await db.commit()
    return entry
