from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import Booking, CompanionProfile


async def get_by_id(db: AsyncSession, booking_id: UUID) -> Booking | None:
    result = await db.execute(select(Booking).where(Booking.id == booking_id))
    return result.scalar_one_or_none()


async def create(db: AsyncSession, *, client_id: UUID, data) -> Booking:
    booking = Booking(
        client_id=client_id,
        profile_id=data.profile_id,
        category=data.category.value,
        requested_start=data.requested_start,
        requested_end=data.requested_end,
        location_note=data.location_note,
        status="requested",
    )
    db.add(booking)
    await db.commit()
    await db.refresh(booking)
    return booking


async def set_status(db: AsyncSession, booking: Booking, *, status: str) -> Booking:
    booking.status = status
    booking.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(booking)
    return booking


async def list_for_client(db: AsyncSession, client_id: UUID) -> list[Booking]:
    result = await db.execute(
        select(Booking).where(Booking.client_id == client_id).order_by(Booking.created_at.desc())
    )
    return list(result.scalars().all())


async def list_for_managed_profiles(db: AsyncSession, user_id: UUID) -> list[Booking]:
    """
    Bookings for any profile owned OR managed (as agent) by user_id — lets
    both a self-managed companion and an agent see requests against their
    profiles from one call.
    """
    result = await db.execute(
        select(Booking)
        .join(CompanionProfile, Booking.profile_id == CompanionProfile.id)
        .where(
            (CompanionProfile.user_id == user_id) | (CompanionProfile.agent_id == user_id)
        )
        .order_by(Booking.created_at.desc())
    )
    return list(result.scalars().all())
