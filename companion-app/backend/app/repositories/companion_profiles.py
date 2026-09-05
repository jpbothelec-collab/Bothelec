from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import CompanionProfile, PortfolioMedia


async def list_managed_by_agent(db: AsyncSession, agent_id: UUID) -> list[CompanionProfile]:
    result = await db.execute(select(CompanionProfile).where(CompanionProfile.agent_id == agent_id))
    return list(result.scalars().all())


async def search_published(
    db: AsyncSession,
    *,
    city: str | None = None,
    category: str | None = None,
    limit: int,
    offset: int,
) -> tuple[list[CompanionProfile], int]:
    """
    Public search over published profiles only. Verification is enforced
    upstream at publish time (a profile can't be published without
    verification_status='verified'), so is_published=True is a sufficient
    filter here — no need to re-join against users.

    Returns (page_of_results, total_matching_count) so the route can build
    pagination metadata without a second round trip from the caller.
    """
    conditions = [CompanionProfile.is_published.is_(True)]
    if city:
        conditions.append(CompanionProfile.city.ilike(f"%{city}%"))
    if category:
        # Postgres ARRAY containment: category = ANY(categories)
        conditions.append(CompanionProfile.categories.any(category))

    base_query = select(CompanionProfile).where(*conditions)

    count_result = await db.execute(
        select(func.count()).select_from(base_query.subquery())
    )
    total = count_result.scalar_one()

    # Ranking: "available now" profiles float to the top, most-recently
    # bumped first (a scheduled rotation job re-bumps them in turn so each
    # available lister cycles through the top). Then newest-published.
    result = await db.execute(
        base_query.order_by(
            CompanionProfile.is_available.desc(),
            CompanionProfile.availability_bumped_at.desc().nullslast(),
            CompanionProfile.published_at.desc(),
        )
        .limit(limit)
        .offset(offset)
    )
    items = list(result.scalars().all())
    return items, total


async def list_all(db: AsyncSession) -> list[CompanionProfile]:
    """All profiles, newest first — for the admin activation dashboard."""
    result = await db.execute(
        select(CompanionProfile).order_by(CompanionProfile.created_at.desc())
    )
    return list(result.scalars().all())


async def get_by_user_id(db: AsyncSession, user_id: UUID) -> CompanionProfile | None:
    result = await db.execute(select(CompanionProfile).where(CompanionProfile.user_id == user_id))
    return result.scalar_one_or_none()


async def get_by_id(db: AsyncSession, profile_id: UUID) -> CompanionProfile | None:
    result = await db.execute(select(CompanionProfile).where(CompanionProfile.id == profile_id))
    return result.scalar_one_or_none()


async def create(db: AsyncSession, *, user_id: UUID, data) -> CompanionProfile:
    profile = CompanionProfile(
        user_id=user_id,
        display_name=data.display_name,
        bio=data.bio,
        city=data.city,
        categories=[c.value for c in data.categories],
        indicative_rate_note=data.indicative_rate_note,
        contact_details=data.contact_details,
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


async def update(db: AsyncSession, profile: CompanionProfile, data) -> CompanionProfile:
    update_fields = data.model_dump(exclude_unset=True)
    for field, value in update_fields.items():
        if field == "categories" and value is not None:
            value = [c.value if hasattr(c, "value") else c for c in value]
        setattr(profile, field, value)
    profile.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(profile)
    return profile


async def set_published(db: AsyncSession, profile: CompanionProfile, *, published: bool) -> None:
    profile.is_published = published
    profile.published_at = datetime.now(timezone.utc) if published else None
    await db.commit()


async def set_listing_fee(db: AsyncSession, profile: CompanionProfile, *, fee_cents: int) -> None:
    profile.monthly_listing_fee_cents = fee_cents
    profile.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(profile)


async def set_price_list(db: AsyncSession, profile: CompanionProfile, *, path: str | None) -> None:
    """Set (or clear, with path=None) the companion's price-list storage key."""
    profile.price_list_path = path
    profile.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(profile)


async def set_availability(db: AsyncSession, profile: CompanionProfile, *, available: bool) -> None:
    """Toggle the 'available now' flag. Turning it on bumps the profile to the
    top of the availability ranking (availability_bumped_at = now)."""
    profile.is_available = available
    if available:
        profile.availability_bumped_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(profile)


async def set_agency(db: AsyncSession, profile: CompanionProfile, *, agent_id: UUID | None) -> None:
    """Link (or unlink, with agent_id=None) a profile to a managing agency."""
    profile.agent_id = agent_id
    profile.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(profile)


async def rotate_oldest_available(db: AsyncSession) -> int:
    """
    Re-bump the single least-recently-bumped available+published profile to
    the top of the availability ranking. Called on a schedule so the top slot
    rotates fairly through all available listers over time. Returns the number
    of profiles bumped (0 or 1).
    """
    result = await db.execute(
        select(CompanionProfile)
        .where(
            CompanionProfile.is_available.is_(True),
            CompanionProfile.is_published.is_(True),
        )
        .order_by(CompanionProfile.availability_bumped_at.asc().nullsfirst())
        .limit(1)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        return 0
    profile.availability_bumped_at = datetime.now(timezone.utc)
    await db.commit()
    return 1


def can_manage(profile: CompanionProfile, user) -> bool:
    """
    True if `user` is allowed to manage this profile's settings (fee,
    publish, media) — either the companion who owns it, or the agent
    assigned as its agent_id.
    """
    return user.id == profile.user_id or (profile.agent_id is not None and user.id == profile.agent_id)


async def count_active_media(db: AsyncSession, profile_id: UUID) -> int:
    """Counts non-rejected images — rejected images don't count against the cap."""
    result = await db.execute(
        select(func.count()).select_from(PortfolioMedia).where(
            PortfolioMedia.profile_id == profile_id,
            PortfolioMedia.moderation_status != "rejected",
        )
    )
    return result.scalar_one()


async def list_media(db: AsyncSession, profile_id: UUID) -> list[PortfolioMedia]:
    result = await db.execute(
        select(PortfolioMedia)
        .where(PortfolioMedia.profile_id == profile_id, PortfolioMedia.moderation_status != "rejected")
        .order_by(PortfolioMedia.display_order)
    )
    return list(result.scalars().all())


async def list_pending_media(db: AsyncSession) -> list[PortfolioMedia]:
    """All portfolio images awaiting moderation, across every profile, oldest first."""
    result = await db.execute(
        select(PortfolioMedia)
        .where(PortfolioMedia.moderation_status == "pending")
        .order_by(PortfolioMedia.created_at.asc())
    )
    return list(result.scalars().all())


async def add_media(
    db: AsyncSession, *, profile_id: UUID, storage_path: str, display_order: int
) -> PortfolioMedia:
    media = PortfolioMedia(
        profile_id=profile_id,
        storage_path=storage_path,
        media_type="image",
        display_order=display_order,
        moderation_status="pending",
    )
    db.add(media)
    await db.commit()
    await db.refresh(media)
    return media


async def get_media(db: AsyncSession, media_id: UUID) -> PortfolioMedia | None:
    result = await db.execute(select(PortfolioMedia).where(PortfolioMedia.id == media_id))
    return result.scalar_one_or_none()


async def delete_media(db: AsyncSession, media: PortfolioMedia) -> None:
    await db.delete(media)
    await db.commit()
