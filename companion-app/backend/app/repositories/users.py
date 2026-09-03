"""
Data access for the users table.
NOTE: This assumes a `User` ORM model (SQLAlchemy) mapped to the `users`
table from migrations/001_initial_schema.sql — add that model under
app/models/orm.py to complete the wiring. Left out here to keep this
scaffold focused on the verification/auth flow logic.
"""
from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import User  # SQLAlchemy model - see note above
from app.models.schemas import UserRole, VerificationStatus


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_by_id(db: AsyncSession, user_id: str | UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    *,
    email: str,
    phone: str | None,
    password_hash: str,
    role: UserRole,
    tos_version: str,
    privacy_version: str,
) -> User:
    """
    Create a new account.

    Callers must pass the legal document versions the user accepted
    (`tos_version`, `privacy_version`). These come from server-side config
    (settings.TOS_VERSION / PRIVACY_POLICY_VERSION), never from the client,
    and are stamped alongside an acceptance timestamp so the agreement is
    provable per-user. The signup route only reaches this function once
    acceptance has been validated (see schemas.SignupRequest).
    """
    now = datetime.now(timezone.utc)
    user = User(
        email=email,
        phone=phone,
        password_hash=password_hash,
        role=role.value,
        verification_status=VerificationStatus.unverified.value,
        tos_accepted_at=now,
        tos_version=tos_version,
        privacy_accepted_at=now,
        privacy_version=privacy_version,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def set_verification_status(
    db: AsyncSession, user_id: UUID, status: VerificationStatus
) -> None:
    user = await get_by_id(db, user_id)
    user.verification_status = status.value
    await db.commit()


async def set_verified(db: AsyncSession, user_id: UUID, *, date_of_birth: date) -> None:
    user = await get_by_id(db, user_id)
    user.verification_status = VerificationStatus.verified.value
    user.date_of_birth = date_of_birth
    user.verified_at = datetime.now(timezone.utc)
    await db.commit()


async def get_by_agency_code(db: AsyncSession, code: str) -> User | None:
    result = await db.execute(select(User).where(User.agency_code == code))
    return result.scalar_one_or_none()


async def set_agency(db: AsyncSession, user: User, *, name: str | None = None,
                     code: str | None = None) -> None:
    """Set an agent's agency name and/or generated join code."""
    if name is not None:
        user.agency_name = name
    if code is not None:
        user.agency_code = code
    await db.commit()
    await db.refresh(user)


async def set_admin_level(db: AsyncSession, user_id: UUID, *, admin_level: str) -> None:
    """Set the admin access tier for a user. Caller must ensure the user is an admin."""
    user = await get_by_id(db, user_id)
    user.admin_level = admin_level
    await db.commit()


async def set_active(db: AsyncSession, user_id: UUID, *, is_active: bool) -> None:
    """
    Hard ban/unban toggle — distinct from verification_status='suspended'.
    A suspended user is blocked from publishing/booking/messaging but can
    still log in (e.g. to see why, or appeal). is_active=False blocks
    login entirely (see dependencies/auth.get_current_user's is_active
    check) — reserve this for more serious cases.
    """
    user = await get_by_id(db, user_id)
    user.is_active = is_active
    await db.commit()
