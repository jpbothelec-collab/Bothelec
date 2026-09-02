"""
Admin dashboard routes.

Consolidates the oversight endpoints an admin needs day-to-day. Some of
these already existed elsewhere in their natural home (identity document
review lives in routes/verification.py, flagged messages in
routes/messaging.py) — this module adds the pieces that don't belong to
any single feature area: the verification queue listing, and direct
account suspension/ban actions independent of a specific report or
flagged message.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_role
from app.models.schemas import AdminUserActionResult, PendingVerificationDocument, UserRole, VerificationStatus
from app.repositories import audit_log as audit_repo
from app.repositories import identity_documents as docs_repo
from app.repositories import users as users_repo

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/verification-queue", response_model=list[PendingVerificationDocument])
async def get_verification_queue(
    admin=Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    """Identity documents awaiting review, oldest first — see routes/verification.py for the review action itself."""
    docs = await docs_repo.list_pending(db)
    return [
        PendingVerificationDocument(
            id=d.id, user_id=d.user_id, document_type=d.document_type, created_at=d.created_at
        )
        for d in docs
    ]


@router.post("/users/{user_id}/suspend", response_model=AdminUserActionResult)
async def suspend_user(
    user_id: UUID,
    admin=Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    """
    Soft suspension: verification_status='suspended' blocks publishing,
    booking, and messaging (anything gated on verification_status ==
    'verified'), but the account can still log in. Use /ban for a harder
    lockout that blocks login entirely.
    """
    await users_repo.set_verification_status(db, user_id, VerificationStatus.suspended)
    await audit_repo.write(
        db, actor_id=admin.id, action="user_suspended", target_type="user", target_id=user_id,
    )
    return AdminUserActionResult(user_id=user_id, detail="User suspended.")


@router.post("/users/{user_id}/reactivate", response_model=AdminUserActionResult)
async def reactivate_user(
    user_id: UUID,
    admin=Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    """
    Reverses a suspension, restoring verification_status='verified'. Only
    use this once the admin has actually confirmed the account is safe to
    restore — this does not re-run identity verification, it just lifts
    the suspension flag.
    """
    await users_repo.set_verification_status(db, user_id, VerificationStatus.verified)
    await audit_repo.write(
        db, actor_id=admin.id, action="user_reactivated", target_type="user", target_id=user_id,
    )
    return AdminUserActionResult(user_id=user_id, detail="User reactivated.")


@router.post("/users/{user_id}/ban", response_model=AdminUserActionResult)
async def ban_user(
    user_id: UUID,
    admin=Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    """Hard ban: is_active=False blocks login entirely. Reserve for serious/confirmed cases."""
    await users_repo.set_active(db, user_id, is_active=False)
    await audit_repo.write(
        db, actor_id=admin.id, action="user_banned", target_type="user", target_id=user_id,
    )
    return AdminUserActionResult(user_id=user_id, detail="User banned.")


@router.post("/users/{user_id}/unban", response_model=AdminUserActionResult)
async def unban_user(
    user_id: UUID,
    admin=Depends(require_role(UserRole.admin)),
    db: AsyncSession = Depends(get_db),
):
    await users_repo.set_active(db, user_id, is_active=True)
    await audit_repo.write(
        db, actor_id=admin.id, action="user_unbanned", target_type="user", target_id=user_id,
    )
    return AdminUserActionResult(user_id=user_id, detail="User unbanned.")
