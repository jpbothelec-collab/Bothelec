"""
Reviews routes.

A review can only be left by the client on a booking they made, and only
once that booking's status is 'completed' — set by the companion/agent
via POST /bookings/{id}/status per Phase 5's booking state machine. One
review per booking is enforced at the DB level (reviews.booking_id is
UNIQUE) and re-checked here for a clean error message.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_role
from app.models.schemas import ReviewCreate, ReviewResponse, UserRole
from app.repositories import bookings as bookings_repo
from app.repositories import reviews as reviews_repo

router = APIRouter(tags=["reviews"])


def _to_response(review) -> ReviewResponse:
    return ReviewResponse(
        id=review.id, booking_id=review.booking_id, author_id=review.author_id,
        profile_id=review.profile_id, rating=review.rating, comment=review.comment,
        created_at=review.created_at,
    )


@router.post("/bookings/{booking_id}/review", response_model=ReviewResponse,
             status_code=status.HTTP_201_CREATED)
async def create_review(
    booking_id: UUID,
    payload: ReviewCreate,
    current_user=Depends(require_role(UserRole.client)),
    db: AsyncSession = Depends(get_db),
):
    booking = await bookings_repo.get_by_id(db, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.client_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only review your own bookings.")
    if booking.status != "completed":
        raise HTTPException(
            status_code=400,
            detail="This booking must be marked completed before it can be reviewed.",
        )

    existing = await reviews_repo.get_by_booking(db, booking_id)
    if existing:
        raise HTTPException(status_code=409, detail="This booking has already been reviewed.")

    review = await reviews_repo.create(
        db, booking_id=booking.id, author_id=current_user.id, profile_id=booking.profile_id,
        rating=payload.rating, comment=payload.comment,
    )
    return _to_response(review)


@router.get("/profiles/{profile_id}/reviews", response_model=list[ReviewResponse])
async def list_profile_reviews(profile_id: UUID, db: AsyncSession = Depends(get_db)):
    """Public — anyone can read a profile's reviews, same as the profile itself."""
    reviews = await reviews_repo.list_for_profile(db, profile_id)
    return [_to_response(r) for r in reviews]
