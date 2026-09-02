"""
Pydantic request/response schemas.
"""
from datetime import date, datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class UserRole(str, Enum):
    client = "client"
    companion = "companion"
    agent = "agent"
    admin = "admin"


class VerificationStatus(str, Enum):
    unverified = "unverified"
    pending_review = "pending_review"
    verified = "verified"
    rejected = "rejected"
    suspended = "suspended"


# --- Signup ---

class SignupRequest(BaseModel):
    email: EmailStr
    phone: str | None = None
    password: str = Field(min_length=10)
    role: UserRole

    # Note: no date_of_birth field here on purpose. Self-reported age is
    # not accepted at signup — age is only confirmed via ID document
    # review in the verification step that follows.


class SignupResponse(BaseModel):
    id: UUID
    email: EmailStr
    role: UserRole
    verification_status: VerificationStatus
    message: str = (
        "Account created. You must complete identity verification "
        "(21+ required) before you can publish a profile or make a booking."
    )


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- Identity verification ---

class IdentityDocumentType(str, Enum):
    sa_id = "sa_id"
    passport = "passport"


class IdentityDocumentSubmitResponse(BaseModel):
    id: UUID
    review_status: VerificationStatus
    message: str = "Document received and queued for review."


class IdentityReviewDecision(BaseModel):
    """Used by an admin reviewing a submitted document."""
    approve: bool
    extracted_dob: date | None = None  # required if approve=True
    extracted_full_name: str | None = None
    rejection_reason: str | None = None  # required if approve=False


class IdentityReviewResult(BaseModel):
    user_id: UUID
    verification_status: VerificationStatus
    reviewed_at: datetime
    detail: str


# --- Companion profiles ---

class CompanionshipCategory(str, Enum):
    dinner_date = "dinner_date"
    event_plus_one = "event_plus_one"
    travel_companion = "travel_companion"
    social_outing = "social_outing"
    other = "other"


class CompanionProfileCreate(BaseModel):
    display_name: str = Field(min_length=2, max_length=80)
    bio: str | None = Field(default=None, max_length=2000)
    city: str | None = None
    categories: list[CompanionshipCategory] = Field(default_factory=list)
    indicative_rate_note: str | None = Field(default=None, max_length=500)


class CompanionProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=80)
    bio: str | None = Field(default=None, max_length=2000)
    city: str | None = None
    categories: list[CompanionshipCategory] | None = None
    indicative_rate_note: str | None = Field(default=None, max_length=500)


class ListingFeeUpdate(BaseModel):
    """
    Sets the monthly platform listing fee for a specific companion profile.
    Amount in ZAR, converted to cents internally. Editable by the profile
    owner (self-managed companion) or the managing agent — lets an agent
    set a different fee per companion they manage.
    """
    monthly_fee_zar: float = Field(ge=0, le=100000, description="Monthly listing fee in ZAR.")


class PortfolioMediaResponse(BaseModel):
    id: UUID
    media_type: str
    display_order: int
    moderation_status: str
    created_at: datetime


class CompanionProfileResponse(BaseModel):
    id: UUID
    user_id: UUID
    agent_id: UUID | None
    display_name: str
    bio: str | None
    city: str | None
    categories: list[CompanionshipCategory]
    indicative_rate_note: str | None
    is_published: bool
    published_at: datetime | None
    monthly_listing_fee_zar: float
    average_rating: float | None
    review_count: int
    total_image_count: int
    visible_image_count: int
    images_locked: bool  # True if there are more approved images than this viewer can see
    media: list[PortfolioMediaResponse] = Field(default_factory=list)


class PortfolioMediaUploadResponse(BaseModel):
    id: UUID
    moderation_status: str
    image_count: int
    upload_limit: int
    message: str = "Image uploaded and queued for moderation review."


class PublishResult(BaseModel):
    id: UUID
    is_published: bool
    detail: str


class ProfileSearchResponse(BaseModel):
    items: list[CompanionProfileResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# --- Bookings ---

class BookingStatus(str, Enum):
    requested = "requested"
    accepted = "accepted"
    declined = "declined"
    canceled = "canceled"
    completed = "completed"
    no_show = "no_show"


class BookingCreate(BaseModel):
    profile_id: UUID
    category: CompanionshipCategory
    requested_start: datetime
    requested_end: datetime | None = None
    location_note: str | None = Field(default=None, max_length=500)


class BookingStatusUpdate(BaseModel):
    status: BookingStatus


class BookingResponse(BaseModel):
    id: UUID
    client_id: UUID
    profile_id: UUID
    category: CompanionshipCategory
    requested_start: datetime
    requested_end: datetime | None
    location_note: str | None
    status: BookingStatus
    agreed_fee_note: str | None
    created_at: datetime
    updated_at: datetime


# --- Messaging ---

class ConversationCreate(BaseModel):
    profile_id: UUID
    booking_id: UUID | None = None


class ConversationResponse(BaseModel):
    id: UUID
    booking_id: UUID | None
    client_id: UUID
    companion_id: UUID
    created_at: datetime


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)


class MessageResponse(BaseModel):
    """
    Sender-facing response. Deliberately omits flagged_reason/review
    fields — a sender shouldn't learn whether their message tripped the
    content filter, since that would just teach evasive rephrasing.
    """
    id: UUID
    conversation_id: UUID
    sender_id: UUID
    body: str
    created_at: datetime


class FlaggedMessageResponse(BaseModel):
    """Admin-facing view of a flagged message, including moderation state."""
    id: UUID
    conversation_id: UUID
    sender_id: UUID
    body: str
    flagged_reason: str | None
    reviewed_at: datetime | None
    review_outcome: str | None
    created_at: datetime


class MessageReviewDecision(BaseModel):
    outcome: str = Field(pattern="^(dismissed|confirmed_violation)$")
    suspend_sender: bool = False


# --- Reviews ---

class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)


class ReviewResponse(BaseModel):
    id: UUID
    booking_id: UUID
    author_id: UUID
    profile_id: UUID
    rating: int
    comment: str | None
    created_at: datetime


# --- User reports (trust & safety) ---

class ReportReason(str, Enum):
    harassment = "harassment"
    solicitation = "solicitation"
    fraud = "fraud"
    safety_concern = "safety_concern"
    other = "other"


class ReportCreate(BaseModel):
    reported_user_id: UUID
    reason: ReportReason
    details: str | None = Field(default=None, max_length=2000)
    related_booking_id: UUID | None = None


class ReportResponse(BaseModel):
    id: UUID
    reporter_id: UUID
    reported_user_id: UUID
    reason: ReportReason
    details: str | None
    related_booking_id: UUID | None
    status: str
    resolution_note: str | None
    created_at: datetime


class ReportResolution(BaseModel):
    status: str = Field(pattern="^(resolved|dismissed)$")
    resolution_note: str | None = Field(default=None, max_length=2000)
    suspend_reported_user: bool = False


# --- Admin ---

class PendingVerificationDocument(BaseModel):
    id: UUID
    user_id: UUID
    document_type: str
    created_at: datetime


class AdminUserActionResult(BaseModel):
    user_id: UUID
    detail: str


class MediaModerationDecision(BaseModel):
    approve: bool
    rejection_reason: str | None = None


# --- Billing ---

class CheckoutResponse(BaseModel):
    authorization_url: str
    access_code: str
    reference: str
