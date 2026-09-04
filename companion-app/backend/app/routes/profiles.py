"""
Companion profile & portfolio routes.

Two independent policies:

1. Upload cap (companion/agent side) — flat MAX_PORTFOLIO_IMAGES (10) per
   profile, same for everyone. See app/services/image_limits.py.

2. Publish gate (companion/agent side) — a profile can only be published
   once the owner is identity-verified (21+) AND has an active monthly
   *listing* subscription. This is the mandatory fee companions/agents pay
   to list at all — not related to image counts.

3. View gate (client side) — free/unauthenticated client viewers only see
   the first CLIENT_FREE_VIEW_LIMIT (5) approved images on a published
   profile. Clients with an active *premium* subscription see all of them
   (up to the upload cap). This is a completely separate subscription from
   the companion's listing subscription — see
   app/repositories/subscriptions.py for the plan-code distinction.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.dependencies.auth import get_optional_user, require_admin_permission, require_role
from app.services.admin_access import AdminPermission
from app.models.schemas import (
    AgencyActionResult,
    AgencyLinkRequest,
    AvailabilityUpdate,
    CompanionProfileCreate,
    CompanionProfileResponse,
    CompanionProfileUpdate,
    CompanionshipCategory,
    ListingFeeUpdate,
    MediaModerationDecision,
    PortfolioMediaUploadResponse,
    ProfileSearchResponse,
    PublishResult,
    UserRole,
    VerificationStatus,
)
from app.repositories import companion_profiles as profiles_repo
from app.repositories import reviews as reviews_repo
from app.repositories import subscriptions as subs_repo
from app.repositories import users as users_repo
from app.services import storage
from app.services.image_limits import (
    ImageLimitExceeded,
    enforce_upload_limit,
    get_client_view_limit,
    get_upload_limit,
)

router = APIRouter(prefix="/profiles", tags=["profiles"])

_COMPANION_ROLES = (UserRole.companion, UserRole.agent)


async def _media_payload(media_items) -> list[dict]:
    """
    Serialise portfolio media with short-lived signed view URLs. Only the
    items passed in are signed — callers pass the viewer's *visible* subset,
    so a free viewer never receives URLs for premium-locked images. If URL
    signing fails (e.g. storage misconfigured), url is left None rather than
    failing the whole profile response.
    """
    if not media_items:
        return []
    try:
        urls = await storage.get_signed_urls(
            [m.storage_path for m in media_items],
            expires_in=settings.PORTFOLIO_URL_TTL_SECONDS,
        )
    except Exception:
        urls = [None] * len(media_items)
    return [
        {
            "id": m.id,
            "media_type": m.media_type,
            "display_order": m.display_order,
            "moderation_status": m.moderation_status,
            "created_at": m.created_at,
            "url": url,
        }
        for m, url in zip(media_items, urls)
    ]


async def _signed(path: str | None) -> str | None:
    """Short-lived signed URL for a stored profile asset (e.g. price list), or None."""
    if not path:
        return None
    try:
        return await storage.get_signed_url(path, expires_in=settings.PORTFOLIO_URL_TTL_SECONDS)
    except Exception:
        return None


async def _agency_name(db: AsyncSession, profile) -> str | None:
    """Resolve the managing agency's name for a profile, if it's linked to one."""
    if not profile.agent_id:
        return None
    agent = await users_repo.get_by_id(db, profile.agent_id)
    return agent.agency_name if agent else None


async def _owner_response(db: AsyncSession, profile) -> CompanionProfileResponse:
    """Full response for the profile owner (or agent managing it) — never gated."""
    media = await profiles_repo.list_media(db, profile.id)
    avg_rating, review_count = await reviews_repo.get_rating_summary(db, profile.id)
    return CompanionProfileResponse(
        id=profile.id,
        user_id=profile.user_id,
        agent_id=profile.agent_id,
        display_name=profile.display_name,
        bio=profile.bio,
        city=profile.city,
        categories=profile.categories,
        indicative_rate_note=profile.indicative_rate_note,
        contact_details=profile.contact_details,
        price_list_url=await _signed(profile.price_list_path),
        is_available=profile.is_available,
        agency_name=await _agency_name(db, profile),
        is_published=profile.is_published,
        published_at=profile.published_at,
        monthly_listing_fee_zar=profile.monthly_listing_fee_cents / 100,
        average_rating=avg_rating,
        review_count=review_count,
        total_image_count=len(media),
        visible_image_count=len(media),
        images_locked=False,
        media=await _media_payload(media),
    )


async def _public_response(
    db: AsyncSession, profile, viewer
) -> CompanionProfileResponse:
    """
    Gated response for public/client viewers: only approved images count,
    and only up to the viewer's tier limit are actually returned. Free or
    unauthenticated viewers get CLIENT_FREE_VIEW_LIMIT (5); clients with an
    active premium subscription get everything up to the upload cap (10).
    """
    all_media = await profiles_repo.list_media(db, profile.id)
    approved = [m for m in all_media if m.moderation_status == "approved"]

    is_premium_client = False
    if viewer is not None and viewer.role == UserRole.client.value:
        is_premium_client = await subs_repo.has_active_premium_view_subscription(db, viewer.id)

    view_limit = get_client_view_limit(is_premium_client)
    visible = approved[:view_limit]

    avg_rating, review_count = await reviews_repo.get_rating_summary(db, profile.id)

    return CompanionProfileResponse(
        id=profile.id,
        user_id=profile.user_id,
        agent_id=profile.agent_id,
        display_name=profile.display_name,
        bio=profile.bio,
        city=profile.city,
        categories=profile.categories,
        indicative_rate_note=profile.indicative_rate_note,
        contact_details=profile.contact_details,
        price_list_url=await _signed(profile.price_list_path),
        is_available=profile.is_available,
        agency_name=await _agency_name(db, profile),
        is_published=profile.is_published,
        published_at=profile.published_at,
        monthly_listing_fee_zar=profile.monthly_listing_fee_cents / 100,
        average_rating=avg_rating,
        review_count=review_count,
        total_image_count=len(approved),
        visible_image_count=len(visible),
        images_locked=len(approved) > len(visible),
        media=await _media_payload(visible),
    )


@router.get("", response_model=ProfileSearchResponse)
async def search_profiles(
    city: str | None = Query(default=None, description="Case-insensitive partial city match."),
    category: CompanionshipCategory | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    viewer=Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Public search over published profiles. Only is_published=True profiles
    are ever returned — a profile can't reach that state without its owner
    being identity-verified (21+) and the profile holding an active
    listing subscription (see routes/profiles.py:publish_my_profile), so
    no additional verification check is needed here.

    Image visibility within each result still follows the client view gate
    (free vs. premium) via _public_response — search doesn't bypass that.

    Sorted newest-published-first. City and category filters are optional
    and combine with AND when both are given.
    """
    offset = (page - 1) * page_size
    profiles, total = await profiles_repo.search_published(
        db,
        city=city,
        category=category.value if category else None,
        limit=page_size,
        offset=offset,
    )

    items = [await _public_response(db, p, viewer) for p in profiles]
    total_pages = (total + page_size - 1) // page_size if total else 0

    return ProfileSearchResponse(
        items=items, total=total, page=page, page_size=page_size, total_pages=total_pages
    )


@router.post("", response_model=CompanionProfileResponse, status_code=status.HTTP_201_CREATED)
async def create_profile(
    payload: CompanionProfileCreate,
    current_user=Depends(require_role(*_COMPANION_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    existing = await profiles_repo.get_by_user_id(db, current_user.id)
    if existing:
        raise HTTPException(status_code=409, detail="A profile already exists for this account.")

    profile = await profiles_repo.create(db, user_id=current_user.id, data=payload)

    # Optionally link to an agency by its share code at creation ("sign up
    # under an agency"). An invalid code is a hard error so the applicant
    # knows it didn't take, rather than silently creating an unlinked profile.
    if payload.agency_code:
        agent = await _resolve_agency(db, payload.agency_code)
        await profiles_repo.set_agency(db, profile, agent_id=agent.id)

    return await _owner_response(db, profile)


async def _resolve_agency(db: AsyncSession, code: str):
    """Look up an agent (agency) by join code, or 404 if it doesn't match one."""
    agent = await users_repo.get_by_agency_code(db, code.strip())
    if not agent or agent.role != UserRole.agent.value:
        raise HTTPException(status_code=404, detail="No agency found for that code.")
    return agent


@router.get("/me", response_model=CompanionProfileResponse)
async def get_my_profile(
    current_user=Depends(require_role(*_COMPANION_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    profile = await profiles_repo.get_by_user_id(db, current_user.id)
    if not profile:
        raise HTTPException(status_code=404, detail="No profile found for this account.")
    return await _owner_response(db, profile)


@router.patch("/me", response_model=CompanionProfileResponse)
async def update_my_profile(
    payload: CompanionProfileUpdate,
    current_user=Depends(require_role(*_COMPANION_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    profile = await profiles_repo.get_by_user_id(db, current_user.id)
    if not profile:
        raise HTTPException(status_code=404, detail="No profile found for this account.")
    profile = await profiles_repo.update(db, profile, payload)
    return await _owner_response(db, profile)


@router.patch("/{profile_id}/listing-fee", response_model=CompanionProfileResponse)
async def set_listing_fee(
    profile_id: UUID,
    payload: ListingFeeUpdate,
    current_user=Depends(require_role(*_COMPANION_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """
    Sets the monthly platform listing fee for a specific profile. Callable
    by the companion who owns the profile, or by the agent assigned to
    manage it (profile.agent_id) — this is how an agent sets a different
    fee per companion under their management. Anyone else gets a 403.
    """
    profile = await profiles_repo.get_by_id(db, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")

    if not profiles_repo.can_manage(profile, current_user):
        raise HTTPException(
            status_code=403,
            detail="Only the profile owner or its managing agent can set the listing fee.",
        )

    fee_cents = round(payload.monthly_fee_zar * 100)
    await profiles_repo.set_listing_fee(db, profile, fee_cents=fee_cents)
    return await _owner_response(db, profile)


@router.get("/managed/by-me", response_model=list[CompanionProfileResponse])
async def list_my_managed_profiles(
    current_user=Depends(require_role(UserRole.agent)),
    db: AsyncSession = Depends(get_db),
):
    """Lists all companion profiles managed by the current agent, each with its own listing fee."""
    profiles = await profiles_repo.list_managed_by_agent(db, current_user.id)
    return [await _owner_response(db, p) for p in profiles]


@router.post("/me/publish", response_model=PublishResult)
async def publish_my_profile(
    current_user=Depends(require_role(*_COMPANION_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    if current_user.verification_status != VerificationStatus.verified.value:
        raise HTTPException(
            status_code=403,
            detail="Identity verification (21+) must be completed before publishing a profile.",
        )

    profile = await profiles_repo.get_by_user_id(db, current_user.id)
    if not profile:
        raise HTTPException(status_code=404, detail="No profile found for this account.")

    has_listing_sub = await subs_repo.has_active_listing_subscription(db, profile.id)
    if not has_listing_sub:
        raise HTTPException(
            status_code=402,
            detail="An active monthly listing subscription is required to publish this profile.",
        )

    media = await profiles_repo.list_media(db, profile.id)
    approved_count = sum(1 for m in media if m.moderation_status == "approved")
    if approved_count == 0:
        raise HTTPException(
            status_code=400,
            detail="At least one approved portfolio image is required before publishing.",
        )

    await profiles_repo.set_published(db, profile, published=True)
    return PublishResult(id=profile.id, is_published=True, detail="Profile published.")


@router.post("/me/unpublish", response_model=PublishResult)
async def unpublish_my_profile(
    current_user=Depends(require_role(*_COMPANION_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    profile = await profiles_repo.get_by_user_id(db, current_user.id)
    if not profile:
        raise HTTPException(status_code=404, detail="No profile found for this account.")
    await profiles_repo.set_published(db, profile, published=False)
    return PublishResult(id=profile.id, is_published=False, detail="Profile unpublished.")


@router.post("/me/availability", response_model=CompanionProfileResponse)
async def set_my_availability(
    payload: AvailabilityUpdate,
    current_user=Depends(require_role(*_COMPANION_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """
    Toggle 'available now'. Turning it on bumps this profile to the top of
    the availability ranking; a scheduled job then rotates the top slot
    through all available listers over time.
    """
    profile = await profiles_repo.get_by_user_id(db, current_user.id)
    if not profile:
        raise HTTPException(status_code=404, detail="No profile found for this account.")
    await profiles_repo.set_availability(db, profile, available=payload.available)
    return await _owner_response(db, profile)


@router.post("/me/agency", response_model=AgencyActionResult)
async def join_agency(
    payload: AgencyLinkRequest,
    current_user=Depends(require_role(*_COMPANION_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Link the caller's profile to an agency using the agency's share code."""
    profile = await profiles_repo.get_by_user_id(db, current_user.id)
    if not profile:
        raise HTTPException(status_code=404, detail="Create a profile before joining an agency.")
    agent = await _resolve_agency(db, payload.agency_code)
    if agent.id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't link a profile to your own agency account.")
    await profiles_repo.set_agency(db, profile, agent_id=agent.id)
    return AgencyActionResult(
        profile_id=profile.id, agency_name=agent.agency_name,
        detail=f"Linked to {agent.agency_name or 'the agency'}.",
    )


@router.delete("/me/agency", response_model=AgencyActionResult)
async def leave_agency(
    current_user=Depends(require_role(*_COMPANION_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """Unlink the caller's profile from its managing agency."""
    profile = await profiles_repo.get_by_user_id(db, current_user.id)
    if not profile:
        raise HTTPException(status_code=404, detail="No profile found for this account.")
    await profiles_repo.set_agency(db, profile, agent_id=None)
    return AgencyActionResult(profile_id=profile.id, agency_name=None, detail="Left the agency.")


@router.post("/me/media", response_model=PortfolioMediaUploadResponse,
             status_code=status.HTTP_201_CREATED)
async def upload_portfolio_image(
    file: UploadFile,
    current_user=Depends(require_role(*_COMPANION_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    profile = await profiles_repo.get_by_user_id(db, current_user.id)
    if not profile:
        raise HTTPException(status_code=404, detail="Create a profile before uploading images.")

    current_count = await profiles_repo.count_active_media(db, profile.id)

    try:
        enforce_upload_limit(current_count)
    except ImageLimitExceeded as e:
        raise HTTPException(
            status_code=403,
            detail=f"Image limit reached ({e.current_count}/{e.limit}). "
                   "Remove an existing image to upload a new one.",
        )

    storage_path = await storage.store_encrypted(
        file, prefix=f"portfolio-media/{profile.id}"
    )
    media = await profiles_repo.add_media(
        db, profile_id=profile.id, storage_path=storage_path, display_order=current_count
    )

    return PortfolioMediaUploadResponse(
        id=media.id,
        moderation_status=media.moderation_status,
        image_count=current_count + 1,
        upload_limit=get_upload_limit(),
    )


@router.delete("/me/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_portfolio_image(
    media_id: UUID,
    current_user=Depends(require_role(*_COMPANION_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    profile = await profiles_repo.get_by_user_id(db, current_user.id)
    if not profile:
        raise HTTPException(status_code=404, detail="No profile found for this account.")

    media = await profiles_repo.get_media(db, media_id)
    if not media or media.profile_id != profile.id:
        raise HTTPException(status_code=404, detail="Image not found on this profile.")

    await storage.delete_object(media.storage_path)
    await profiles_repo.delete_media(db, media)


@router.post("/me/price-list", response_model=CompanionProfileResponse)
async def upload_price_list(
    file: UploadFile,
    current_user=Depends(require_role(*_COMPANION_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload the companion's own price-list document (pdf or image). This is
    advertised to clients for information only — the companionship fee is
    settled directly, off-platform, and the platform never handles it.
    """
    profile = await profiles_repo.get_by_user_id(db, current_user.id)
    if not profile:
        raise HTTPException(status_code=404, detail="Create a profile before uploading a price list.")
    try:
        key = await storage.store_encrypted(file, prefix=f"price-lists/{profile.id}")
    except storage.UnsupportedFileType as e:
        raise HTTPException(status_code=415, detail=str(e))
    except storage.FileTooLarge as e:
        raise HTTPException(status_code=413, detail=str(e))
    if profile.price_list_path:
        try:
            await storage.delete_object(profile.price_list_path)
        except Exception:
            pass
    await profiles_repo.set_price_list(db, profile, path=key)
    return await _owner_response(db, profile)


@router.delete("/me/price-list", response_model=CompanionProfileResponse)
async def delete_price_list(
    current_user=Depends(require_role(*_COMPANION_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    profile = await profiles_repo.get_by_user_id(db, current_user.id)
    if not profile:
        raise HTTPException(status_code=404, detail="No profile found for this account.")
    if profile.price_list_path:
        try:
            await storage.delete_object(profile.price_list_path)
        except Exception:
            pass
    await profiles_repo.set_price_list(db, profile, path=None)
    return await _owner_response(db, profile)


# --- Agent-facing management of a roster companion's profile by id ---
# These are defined after every literal "/me/..." route so that a request to
# e.g. POST /profiles/me/availability matches the literal route rather than
# binding profile_id="me" here.

@router.patch("/{profile_id}", response_model=CompanionProfileResponse)
async def manage_profile(
    profile_id: UUID,
    payload: CompanionProfileUpdate,
    current_user=Depends(require_role(*_COMPANION_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """
    Edit a profile's details by id. Callable by the companion who owns the
    profile or by the agent assigned to manage it (profile.agent_id) — this
    is how an agency edits a roster companion's profile inline. Anyone else
    gets a 403. Companions editing their own profile normally use
    PATCH /profiles/me; this endpoint is the agent-facing equivalent.
    """
    profile = await profiles_repo.get_by_id(db, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")
    if not profiles_repo.can_manage(profile, current_user):
        raise HTTPException(
            status_code=403,
            detail="Only the profile owner or its managing agent can edit this profile.",
        )
    profile = await profiles_repo.update(db, profile, payload)
    return await _owner_response(db, profile)


@router.post("/{profile_id}/availability", response_model=CompanionProfileResponse)
async def set_profile_availability(
    profile_id: UUID,
    payload: AvailabilityUpdate,
    current_user=Depends(require_role(*_COMPANION_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    """
    Toggle 'available now' for a profile by id — the agent-facing counterpart
    to POST /profiles/me/availability. Callable by the profile owner or its
    managing agent, so an agency can surface a roster companion from its page.
    """
    profile = await profiles_repo.get_by_id(db, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")
    if not profiles_repo.can_manage(profile, current_user):
        raise HTTPException(
            status_code=403,
            detail="Only the profile owner or its managing agent can change availability.",
        )
    await profiles_repo.set_availability(db, profile, available=payload.available)
    return await _owner_response(db, profile)


@router.get("/{profile_id}", response_model=CompanionProfileResponse)
async def get_public_profile(
    profile_id: UUID,
    viewer=Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Public read endpoint — only returns published profiles. Image
    visibility depends on the viewer: anonymous or free clients see the
    first CLIENT_FREE_VIEW_LIMIT images; clients with an active premium
    subscription see everything.
    """
    profile = await profiles_repo.get_by_id(db, profile_id)
    if not profile or not profile.is_published:
        raise HTTPException(status_code=404, detail="Profile not found.")
    return await _public_response(db, profile, viewer)


@router.post("/media/{media_id}/moderate", status_code=status.HTTP_200_OK)
async def moderate_portfolio_image(
    media_id: UUID,
    decision: MediaModerationDecision,
    admin=Depends(require_admin_permission(AdminPermission.MODERATE_CONTENT)),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin review of a pending portfolio image. Rejected images are removed
    from storage and don't count against the uploader's image cap, so a
    rejection frees up a slot for a new upload.
    """
    media = await profiles_repo.get_media(db, media_id)
    if not media:
        raise HTTPException(status_code=404, detail="Media not found.")

    if decision.approve:
        media.moderation_status = "approved"
        await db.commit()
        return {"id": media.id, "moderation_status": "approved"}

    if not decision.rejection_reason:
        raise HTTPException(status_code=422, detail="rejection_reason is required when approve=False.")

    await storage.delete_object(media.storage_path)
    media.moderation_status = "rejected"
    await db.commit()
    return {"id": media.id, "moderation_status": "rejected", "reason": decision.rejection_reason}
