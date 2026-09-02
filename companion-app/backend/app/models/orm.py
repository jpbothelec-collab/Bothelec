"""
SQLAlchemy ORM models mapped to migrations/001_initial_schema.sql.
Covers users, identity_documents, companion_profiles, portfolio_media,
and subscriptions. Extend with Booking, Conversation, Review, etc. as
those phases get built out.
"""
import uuid

from sqlalchemy import Date, DateTime, ForeignKey, Integer, JSON, String, Boolean, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True,
                                           default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    phone: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)

    date_of_birth: Mapped[Date | None] = mapped_column(Date, nullable=True)
    verification_status: Mapped[str] = mapped_column(String, nullable=False,
                                                       default="unverified")
    verified_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Admin access tier; only meaningful when role='admin'. NULL == full
    # access (legacy/bootstrap). See app/services/admin_access.py.
    admin_level: Mapped[str | None] = mapped_column(String, nullable=True)

    # Legal acceptance capture — recorded at signup, see repositories/users.create_user.
    tos_accepted_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    tos_version: Mapped[str | None] = mapped_column(String, nullable=True)
    privacy_accepted_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True),
                                                                  nullable=True)
    privacy_version: Mapped[str | None] = mapped_column(String, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True),
                                                  server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True),
                                                  server_default=func.now())


class IdentityDocument(Base):
    __tablename__ = "identity_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True,
                                           default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                ForeignKey("users.id", ondelete="CASCADE"))
    document_type: Mapped[str] = mapped_column(String, nullable=False)
    # Nullable because the retention purge job clears this once the
    # document has aged past ID_DOCUMENT_RETENTION_DAYS — the row itself
    # is kept for audit purposes, but the file pointer is removed.
    storage_path: Mapped[str | None] = mapped_column(String, nullable=True)
    extracted_dob: Mapped[Date | None] = mapped_column(Date, nullable=True)
    extracted_full_name: Mapped[str | None] = mapped_column(String, nullable=True)

    review_status: Mapped[str] = mapped_column(String, nullable=False, default="pending_review")
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True),
                                                           ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(String, nullable=True)

    # POPIA special-PI consent captured at submission time.
    consent_given_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True),
                                                               nullable=True)
    consent_version: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True),
                                                  server_default=func.now())


class CompanionProfile(Base):
    __tablename__ = "companion_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True,
                                           default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    agent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True),
                                                        ForeignKey("users.id"), nullable=True)

    display_name: Mapped[str] = mapped_column(String, nullable=False)
    bio: Mapped[str | None] = mapped_column(String, nullable=True)
    city: Mapped[str | None] = mapped_column(String, nullable=True)
    categories: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    indicative_rate_note: Mapped[str | None] = mapped_column(String, nullable=True)

    # Monthly platform listing fee for THIS profile, in ZAR cents. Set by
    # the companion (self-managed) or by the managing agent — agents can
    # set a different fee per companion they manage. Not the booking fee.
    monthly_listing_fee_cents: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    provider_plan_code: Mapped[str | None] = mapped_column(String, nullable=True)
    provider_plan_synced_fee_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)

    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    published_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True),
                                                  server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True),
                                                  server_default=func.now())


class PortfolioMedia(Base):
    __tablename__ = "portfolio_media"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True,
                                           default=uuid.uuid4)
    profile_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companion_profiles.id", ondelete="CASCADE")
    )
    storage_path: Mapped[str] = mapped_column(String, nullable=False)
    media_type: Mapped[str] = mapped_column(String, nullable=False, default="image")
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    moderation_status: Mapped[str] = mapped_column(String, nullable=False, default="pending")

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True),
                                                  server_default=func.now())


class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True,
                                           default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                ForeignKey("users.id", ondelete="CASCADE"))
    # Set for listing subscriptions (tied to one companion profile so an
    # agent can pay a different fee per companion). NULL for client
    # premium view subscriptions.
    profile_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("companion_profiles.id", ondelete="CASCADE"), nullable=True
    )
    provider: Mapped[str] = mapped_column(String, nullable=False)
    provider_subscription_id: Mapped[str] = mapped_column(String, nullable=False)
    provider_plan_code: Mapped[str | None] = mapped_column(String, nullable=True)
    provider_customer_code: Mapped[str | None] = mapped_column(String, nullable=True)
    plan_code: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="trialing")

    current_period_start: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True),
                                                                    nullable=True)
    current_period_end: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True),
                                                                  nullable=True)
    canceled_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True),
                                                  server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True),
                                                  server_default=func.now())


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True,
                                           default=uuid.uuid4)
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    profile_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                   ForeignKey("companion_profiles.id"))

    category: Mapped[str] = mapped_column(String, nullable=False)
    requested_start: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False)
    requested_end: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    location_note: Mapped[str | None] = mapped_column(String, nullable=True)

    status: Mapped[str] = mapped_column(String, nullable=False, default="requested")
    agreed_fee_note: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True),
                                                  server_default=func.now())
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True),
                                                  server_default=func.now())


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True,
                                           default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True
    )
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    companion_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True),
                                                  server_default=func.now())


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True,
                                           default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE")
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(String, nullable=False)

    flagged_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    reviewed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True),
                                                           ForeignKey("users.id"), nullable=True)
    review_outcome: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True),
                                                  server_default=func.now())


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True,
                                           default=uuid.uuid4)
    booking_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                   ForeignKey("bookings.id"), unique=True)
    author_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    profile_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
                                                   ForeignKey("companion_profiles.id"))
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True),
                                                  server_default=func.now())


class UserReport(Base):
    __tablename__ = "user_reports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True,
                                           default=uuid.uuid4)
    reporter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    reported_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    reason: Mapped[str] = mapped_column(String, nullable=False)
    details: Mapped[str | None] = mapped_column(String, nullable=True)
    related_booking_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bookings.id"), nullable=True
    )

    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    resolution_note: Mapped[str | None] = mapped_column(String, nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True),
                                                           ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[DateTime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True),
                                                  server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True,
                                           default=uuid.uuid4)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True),
                                                        ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String, nullable=False)
    target_type: Mapped[str] = mapped_column(String, nullable=False)
    target_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    log_metadata: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)

    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True),
                                                  server_default=func.now())
