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
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_admin_permission
from app.core.config import settings
from app.models.schemas import (
    AdminLevel,
    AdminLevelResponse,
    AdminProfileRow,
    AdminUserActionResult,
    PendingMediaItem,
    PendingVerificationDocument,
    ProfileActivationResult,
    SetAdminLevelRequest,
    UserRole,
    VerificationStatus,
)
from app.repositories import audit_log as audit_repo
from app.repositories import companion_profiles as profiles_repo
from app.repositories import identity_documents as docs_repo
from app.repositories import subscriptions as subs_repo
from app.repositories import users as users_repo
from app.services import admin_access, storage
from app.services.admin_access import AdminPermission


async def _signed(path: str | None) -> str | None:
    if not path:
        return None
    try:
        return await storage.get_signed_url(path, expires_in=settings.PORTFOLIO_URL_TTL_SECONDS)
    except Exception:
        return None

_LISTING_PLAN = {"agent": "agent_listing_monthly", "companion": "companion_listing_monthly"}

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/verification-queue", response_model=list[PendingVerificationDocument])
async def get_verification_queue(
    admin=Depends(require_admin_permission(AdminPermission.REVIEW_VERIFICATION)),
    db: AsyncSession = Depends(get_db),
):
    """Identity documents awaiting review, oldest first — see routes/verification.py for the review action itself."""
    docs = await docs_repo.list_pending(db)
    return [
        PendingVerificationDocument(
            id=d.id, user_id=d.user_id, document_type=d.document_type, created_at=d.created_at,
            image_url=await _signed(d.storage_path),
        )
        for d in docs
    ]


@router.get("/pending-media", response_model=list[PendingMediaItem])
async def get_pending_media(
    admin=Depends(require_admin_permission(AdminPermission.MODERATE_CONTENT)),
    db: AsyncSession = Depends(get_db),
):
    """Portfolio photos awaiting moderation, across all profiles, with signed view URLs."""
    items: list[PendingMediaItem] = []
    for m in await profiles_repo.list_pending_media(db):
        profile = await profiles_repo.get_by_id(db, m.profile_id)
        items.append(PendingMediaItem(
            id=m.id,
            profile_id=m.profile_id,
            display_name=profile.display_name if profile else "(unknown)",
            created_at=m.created_at,
            url=await _signed(m.storage_path),
        ))
    return items


@router.post("/users/{user_id}/suspend", response_model=AdminUserActionResult)
async def suspend_user(
    user_id: UUID,
    admin=Depends(require_admin_permission(AdminPermission.SUSPEND_USERS)),
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
    admin=Depends(require_admin_permission(AdminPermission.SUSPEND_USERS)),
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
    admin=Depends(require_admin_permission(AdminPermission.BAN_USERS)),
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
    admin=Depends(require_admin_permission(AdminPermission.BAN_USERS)),
    db: AsyncSession = Depends(get_db),
):
    await users_repo.set_active(db, user_id, is_active=True)
    await audit_repo.write(
        db, actor_id=admin.id, action="user_unbanned", target_type="user", target_id=user_id,
    )
    return AdminUserActionResult(user_id=user_id, detail="User unbanned.")


@router.get("/profiles", response_model=list[AdminProfileRow])
async def list_profiles_for_activation(
    admin=Depends(require_admin_permission(AdminPermission.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """
    All companion profiles with their activation state (owner verification,
    listing subscription, approved-photo count, published) — the data the
    admin activation dashboard needs to decide what to switch on.
    """
    rows: list[AdminProfileRow] = []
    for p in await profiles_repo.list_all(db):
        owner = await users_repo.get_by_id(db, p.user_id)
        if not owner:
            continue
        sub = await subs_repo.get_active_listing_subscription(db, p.id)
        media = await profiles_repo.list_media(db, p.id)
        rows.append(AdminProfileRow(
            id=p.id,
            display_name=p.display_name,
            owner_email=owner.email,
            owner_role=UserRole(owner.role),
            owner_verification_status=VerificationStatus(owner.verification_status),
            monthly_listing_fee_zar=p.monthly_listing_fee_cents / 100,
            listing_active=sub is not None,
            listing_is_manual=bool(sub and sub.provider == "manual"),
            approved_photo_count=sum(1 for m in media if m.moderation_status == "approved"),
            is_published=p.is_published,
            is_featured=bool(p.featured_until and p.featured_until > datetime.now(timezone.utc)),
            featured_until=p.featured_until,
        ))
    return rows


@router.post("/profiles/{profile_id}/feature", response_model=AdminProfileRow)
async def feature_profile(
    profile_id: UUID,
    admin=Depends(require_admin_permission(AdminPermission.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Grant (or extend) a featured boost for FEATURED_LISTING_DAYS — admin comp, no payment."""
    profile = await profiles_repo.get_by_id(db, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")
    now = datetime.now(timezone.utc)
    base = profile.featured_until if (profile.featured_until and profile.featured_until > now) else now
    until = base + timedelta(days=settings.FEATURED_LISTING_DAYS)
    await profiles_repo.set_featured(db, profile, until=until)
    await audit_repo.write(
        db, actor_id=admin.id, action="profile_featured_manually",
        target_type="companion_profile", target_id=profile.id,
        metadata={"featured_until": until.isoformat()},
    )
    return await _admin_profile_row(db, profile)


@router.post("/profiles/{profile_id}/unfeature", response_model=AdminProfileRow)
async def unfeature_profile(
    profile_id: UUID,
    admin=Depends(require_admin_permission(AdminPermission.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """Clear a featured boost immediately."""
    profile = await profiles_repo.get_by_id(db, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")
    await profiles_repo.set_featured(db, profile, until=None)
    await audit_repo.write(
        db, actor_id=admin.id, action="profile_unfeatured",
        target_type="companion_profile", target_id=profile.id,
    )
    return await _admin_profile_row(db, profile)


async def _admin_profile_row(db: AsyncSession, p) -> AdminProfileRow:
    owner = await users_repo.get_by_id(db, p.user_id)
    sub = await subs_repo.get_active_listing_subscription(db, p.id)
    media = await profiles_repo.list_media(db, p.id)
    return AdminProfileRow(
        id=p.id,
        display_name=p.display_name,
        owner_email=owner.email if owner else "(unknown)",
        owner_role=UserRole(owner.role) if owner else UserRole.companion,
        owner_verification_status=VerificationStatus(owner.verification_status) if owner else VerificationStatus.unverified,
        monthly_listing_fee_zar=p.monthly_listing_fee_cents / 100,
        listing_active=sub is not None,
        listing_is_manual=bool(sub and sub.provider == "manual"),
        approved_photo_count=sum(1 for m in media if m.moderation_status == "approved"),
        is_published=p.is_published,
        is_featured=bool(p.featured_until and p.featured_until > datetime.now(timezone.utc)),
        featured_until=p.featured_until,
    )


@router.post("/profiles/{profile_id}/activate", response_model=ProfileActivationResult)
async def activate_profile(
    profile_id: UUID,
    admin=Depends(require_admin_permission(AdminPermission.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """
    Manual activation override (no payment): mark the profile owner
    identity-verified and grant an active listing subscription, so the
    profile can be published without going through Paystack. Photos still
    pass through moderation, and the owner still clicks Publish. Use for
    launch/testing or comped listings; audited.
    """
    profile = await profiles_repo.get_by_id(db, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")
    owner = await users_repo.get_by_id(db, profile.user_id)
    if not owner:
        raise HTTPException(status_code=404, detail="Profile owner not found.")

    if owner.verification_status != VerificationStatus.verified.value:
        await users_repo.set_verification_status(db, owner.id, VerificationStatus.verified)

    plan_code = _LISTING_PLAN.get(owner.role, "companion_listing_monthly")
    await subs_repo.grant_manual_listing(db, user_id=owner.id, profile_id=profile.id, plan_code=plan_code)

    await audit_repo.write(
        db, actor_id=admin.id, action="profile_activated_manually",
        target_type="companion_profile", target_id=profile.id,
        metadata={"owner_id": str(owner.id), "plan_code": plan_code},
    )
    return ProfileActivationResult(
        profile_id=profile.id,
        owner_verification_status=VerificationStatus.verified,
        listing_active=True,
        detail="Profile activated: owner verified and listing subscription granted.",
    )


@router.post("/profiles/{profile_id}/deactivate", response_model=ProfileActivationResult)
async def deactivate_profile(
    profile_id: UUID,
    admin=Depends(require_admin_permission(AdminPermission.MANAGE_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    """
    Reverse a manual activation: cancel the manually-granted listing
    subscription and unpublish the profile. Only affects 'manual'
    subscriptions — a real Paystack subscription must be canceled through
    the billing flow. Owner verification is left intact.
    """
    profile = await profiles_repo.get_by_id(db, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")

    canceled = await subs_repo.cancel_manual_listing(db, profile.id)
    if not canceled:
        raise HTTPException(
            status_code=409,
            detail="No manual listing to cancel (there may be a Paystack subscription — cancel it via billing).",
        )
    if profile.is_published:
        await profiles_repo.set_published(db, profile, published=False)

    await audit_repo.write(
        db, actor_id=admin.id, action="profile_deactivated_manually",
        target_type="companion_profile", target_id=profile.id,
    )
    owner = await users_repo.get_by_id(db, profile.user_id)
    return ProfileActivationResult(
        profile_id=profile.id,
        owner_verification_status=VerificationStatus(owner.verification_status),
        listing_active=False,
        detail="Manual listing canceled and profile unpublished.",
    )


@router.post("/admins/{user_id}/level", response_model=AdminLevelResponse)
async def set_admin_level(
    user_id: UUID,
    payload: SetAdminLevelRequest,
    admin=Depends(require_admin_permission(AdminPermission.MANAGE_ADMINS)),
    db: AsyncSession = Depends(get_db),
):
    """
    Assign an admin access tier to an existing admin (see AdminLevel).
    Requires the MANAGE_ADMINS capability (superadmin tier). The very first
    superadmin has to be seeded directly in the database — this endpoint
    tiers admins once one exists, it does not grant the admin role itself.
    """
    target = await users_repo.get_by_id(db, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if target.role != UserRole.admin.value:
        raise HTTPException(
            status_code=400,
            detail="Admin tiers apply only to users with the admin role.",
        )

    await users_repo.set_admin_level(db, user_id, admin_level=payload.level.value)
    await audit_repo.write(
        db, actor_id=admin.id, action="admin_level_set", target_type="user", target_id=user_id,
        metadata={"admin_level": payload.level.value},
    )
    perms = sorted(p.value for p in admin_access.LEVEL_PERMISSIONS[payload.level])
    return AdminLevelResponse(
        user_id=user_id,
        admin_level=payload.level,
        permissions=perms,
        detail=f"Admin tier set to '{payload.level.value}'.",
    )
