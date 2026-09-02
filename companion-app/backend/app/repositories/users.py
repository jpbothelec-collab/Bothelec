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
    db: AsyncSession, *, email: str, phone: str | None, password_hash: str, role: UserRole
) -> User:
    user = User(
        email=email,
        phone=phone,
        password_hash=password_hash,
        role=role.value,
        verification_status=VerificationStatus.unverified.value,
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
