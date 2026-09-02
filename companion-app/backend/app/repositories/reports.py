from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import UserReport


async def create(
    db: AsyncSession, *, reporter_id: UUID, reported_user_id: UUID, reason: str,
    details: str | None, related_booking_id: UUID | None,
) -> UserReport:
    report = UserReport(
        reporter_id=reporter_id,
        reported_user_id=reported_user_id,
        reason=reason,
        details=details,
        related_booking_id=related_booking_id,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report


async def get_by_id(db: AsyncSession, report_id: UUID) -> UserReport | None:
    result = await db.execute(select(UserReport).where(UserReport.id == report_id))
    return result.scalar_one_or_none()


async def list_pending(db: AsyncSession) -> list[UserReport]:
    result = await db.execute(
        select(UserReport).where(UserReport.status == "pending").order_by(UserReport.created_at.asc())
    )
    return list(result.scalars().all())


async def resolve(
    db: AsyncSession, report: UserReport, *, admin_id: UUID, status: str, resolution_note: str | None,
) -> UserReport:
    report.status = status
    report.resolution_note = resolution_note
    report.reviewed_by = admin_id
    report.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(report)
    return report
