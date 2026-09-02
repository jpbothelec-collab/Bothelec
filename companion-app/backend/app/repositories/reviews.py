from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import Review


async def get_by_booking(db: AsyncSession, booking_id: UUID) -> Review | None:
    result = await db.execute(select(Review).where(Review.booking_id == booking_id))
    return result.scalar_one_or_none()


async def create(
    db: AsyncSession, *, booking_id: UUID, author_id: UUID, profile_id: UUID,
    rating: int, comment: str | None,
) -> Review:
    review = Review(
        booking_id=booking_id, author_id=author_id, profile_id=profile_id,
        rating=rating, comment=comment,
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)
    return review


async def list_for_profile(db: AsyncSession, profile_id: UUID) -> list[Review]:
    result = await db.execute(
        select(Review).where(Review.profile_id == profile_id).order_by(Review.created_at.desc())
    )
    return list(result.scalars().all())


async def get_rating_summary(db: AsyncSession, profile_id: UUID) -> tuple[float | None, int]:
    """Returns (average_rating, review_count) for a profile. average is None if there are no reviews."""
    result = await db.execute(
        select(func.avg(Review.rating), func.count(Review.id)).where(Review.profile_id == profile_id)
    )
    avg, count = result.one()
    return (round(float(avg), 2) if avg is not None else None, count)
