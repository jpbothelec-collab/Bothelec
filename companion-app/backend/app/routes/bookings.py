"""
Booking request routes.

A booking here is a coordination record only — category, requested time,
location note. The companionship fee itself (agreed_fee_note is purely
informational free text) is settled directly between client and
companion/agent, off-platform — the platform is never a party to that
payment, consistent with the listing-fee vs. booking-fee separation
established in earlier phases.

Status transitions are enforced by app/services/booking_state.py so the
same rules apply everywhere a status changes, rather than being
reimplemented per-endpoint.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_role
from app.models.schemas import BookingCreate, BookingResponse, BookingStatusUpdate, UserRole
from app.repositories import bookings as bookings_repo
from app.repositories import companion_profiles as profiles_repo
from app.services.booking_state import InvalidBookingTransition, enforce_transition

router = APIRouter(prefix="/bookings", tags=["bookings"])


def _to_response(booking) -> BookingResponse:
    return BookingResponse(
        id=booking.id,
        client_id=booking.client_id,
        profile_id=booking.profile_id,
        category=booking.category,
        requested_start=booking.requested_start,
        requested_end=booking.requested_end,
        location_note=booking.location_note,
        status=booking.status,
        agreed_fee_note=booking.agreed_fee_note,
        created_at=booking.created_at,
        updated_at=booking.updated_at,
    )


@router.post("", response_model=BookingResponse, status_code=status.HTTP_201_CREATED)
async def create_booking(
    payload: BookingCreate,
    current_user=Depends(require_role(UserRole.client)),
    db: AsyncSession = Depends(get_db),
):
    if current_user.verification_status != "verified":
        raise HTTPException(
            status_code=403,
            detail="Identity verification (21+) must be completed before requesting a booking.",
        )

    profile = await profiles_repo.get_by_id(db, payload.profile_id)
    if not profile or not profile.is_published:
        raise HTTPException(status_code=404, detail="Profile not found or not currently published.")

    booking = await bookings_repo.create(db, client_id=current_user.id, data=payload)
    return _to_response(booking)


@router.get("/me", response_model=list[BookingResponse])
async def list_my_bookings(
    current_user=Depends(require_role(UserRole.client, UserRole.companion, UserRole.agent)),
    db: AsyncSession = Depends(get_db),
):
    """
    Clients see bookings they requested. Companions/agents see booking
    requests against any profile they own or manage.
    """
    if current_user.role == UserRole.client.value:
        bookings = await bookings_repo.list_for_client(db, current_user.id)
    else:
        bookings = await bookings_repo.list_for_managed_profiles(db, current_user.id)
    return [_to_response(b) for b in bookings]


@router.post("/{booking_id}/status", response_model=BookingResponse)
async def update_booking_status(
    booking_id: UUID,
    payload: BookingStatusUpdate,
    current_user=Depends(require_role(UserRole.client, UserRole.companion, UserRole.agent)),
    db: AsyncSession = Depends(get_db),
):
    booking = await bookings_repo.get_by_id(db, booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")

    is_client = current_user.id == booking.client_id
    profile = await profiles_repo.get_by_id(db, booking.profile_id)
    is_manager = profile is not None and profiles_repo.can_manage(profile, current_user)

    if not is_client and not is_manager:
        raise HTTPException(status_code=403, detail="You are not a party to this booking.")

    actor = "client" if is_client else "companion"
    try:
        enforce_transition(booking.status, payload.status.value, actor=actor)
    except InvalidBookingTransition as e:
        raise HTTPException(status_code=400, detail=str(e))

    booking = await bookings_repo.set_status(db, booking, status=payload.status.value)
    return _to_response(booking)
