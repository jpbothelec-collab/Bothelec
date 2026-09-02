"""
Auto-unpublish job for lapsed listing subscriptions.

Closes a gap flagged during Phase 4: publishing a profile checks for an
active listing subscription at the moment of publishing (see
routes/profiles.py:publish_my_profile), but nothing previously re-checked
that ongoing — a profile stayed is_published=True even after its
subscription lapsed. This job finds published profiles with no currently
active listing subscription and unpublishes them, logging the action for
audit purposes.

Run this on a schedule (daily is reasonable — a lapsed subscription isn't
urgent enough to need hourly checks, and daily keeps load low).

    python -m app.jobs.unpublish_expired_listings
"""
import asyncio

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.orm import CompanionProfile
from app.repositories import audit_log as audit_repo
from app.repositories import companion_profiles as profiles_repo
from app.repositories import subscriptions as subs_repo


async def unpublish_expired_listings() -> int:
    unpublished_count = 0

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(CompanionProfile).where(CompanionProfile.is_published.is_(True))
        )
        published_profiles = result.scalars().all()

        for profile in published_profiles:
            has_active_sub = await subs_repo.has_active_listing_subscription(db, profile.id)
            if not has_active_sub:
                await profiles_repo.set_published(db, profile, published=False)
                await audit_repo.write(
                    db,
                    actor_id=None,  # system action, not an admin
                    action="profile_auto_unpublished",
                    target_type="companion_profile",
                    target_id=profile.id,
                    metadata={"reason": "listing_subscription_lapsed"},
                )
                unpublished_count += 1

    return unpublished_count


if __name__ == "__main__":
    count = asyncio.run(unpublish_expired_listings())
    print(f"Auto-unpublished {count} profile(s) with lapsed listing subscriptions.")
