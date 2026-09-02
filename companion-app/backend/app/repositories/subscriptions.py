from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.orm import Subscription

# Plan codes are free-text in the DB (see subscriptions.plan_code) but the
# platform only really cares about which *purpose* a plan serves. Keep the
# mapping here as the single source of truth rather than checking specific
# plan_code strings all over the codebase.
LISTING_PLAN_CODES = {"companion_listing_monthly", "agent_listing_monthly"}
CLIENT_PREMIUM_PLAN_CODES = {"client_premium_monthly"}


def _not_expired(sub: Subscription) -> bool:
    if not sub.current_period_end:
        return True
    return sub.current_period_end >= datetime.now(timezone.utc)


async def has_active_listing_subscription(db: AsyncSession, profile_id: UUID) -> bool:
    """
    True if THIS SPECIFIC companion profile has an active monthly listing
    subscription attached to it. Listing subscriptions are per-profile
    (not per-user) so an agent managing several companions can pay a
    different fee for each one and each profile's access is independent —
    one lapsed profile doesn't affect the agent's other listings.
    """
    result = await db.execute(
        select(Subscription).where(
            Subscription.profile_id == profile_id,
            Subscription.plan_code.in_(LISTING_PLAN_CODES),
            Subscription.status.in_(("active", "trialing")),
        )
    )
    subs = result.scalars().all()
    return any(_not_expired(s) for s in subs)


async def has_active_premium_view_subscription(db: AsyncSession, user_id: UUID) -> bool:
    """
    True if this client has an active premium subscription that unlocks
    the remaining portfolio images beyond the free view limit.

    Premium is payable from day 1 — there is no trial grace period here,
    unlike listing subscriptions which may support 'trialing'. Only
    status == 'active' counts; a 'trialing' client-premium row (which
    shouldn't be created in the first place, see billing service) is
    intentionally NOT treated as unlocking access.
    """
    result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == user_id,
            Subscription.plan_code.in_(CLIENT_PREMIUM_PLAN_CODES),
            Subscription.status == "active",
        )
    )
    subs = result.scalars().all()
    return any(_not_expired(s) for s in subs)


async def get_active_listing_subscription(db: AsyncSession, profile_id: UUID) -> Subscription | None:
    """The current non-ended listing subscription row for a profile, if any (for cancellation)."""
    result = await db.execute(
        select(Subscription).where(
            Subscription.profile_id == profile_id,
            Subscription.plan_code.in_(LISTING_PLAN_CODES),
            Subscription.status.in_(("active", "trialing", "past_due")),
        )
    )
    return next((s for s in result.scalars().all() if _not_expired(s)), None)


async def get_active_premium_subscription(db: AsyncSession, user_id: UUID) -> Subscription | None:
    """The current non-ended client-premium subscription row for a user, if any (for cancellation)."""
    result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == user_id,
            Subscription.plan_code.in_(CLIENT_PREMIUM_PLAN_CODES),
            Subscription.status.in_(("active", "past_due")),
        )
    )
    return next((s for s in result.scalars().all() if _not_expired(s)), None)


async def get_by_provider_ref(db: AsyncSession, *, provider: str, provider_subscription_id: str) -> Subscription | None:
    result = await db.execute(
        select(Subscription).where(
            Subscription.provider == provider,
            Subscription.provider_subscription_id == provider_subscription_id,
        )
    )
    return result.scalar_one_or_none()


async def upsert_from_webhook(
    db: AsyncSession,
    *,
    user_id: UUID,
    profile_id: UUID | None,
    provider: str,
    provider_subscription_id: str,
    provider_plan_code: str | None,
    provider_customer_code: str | None,
    plan_code: str,
    status: str,
    current_period_start=None,
    current_period_end=None,
) -> Subscription:
    """
    Called exclusively from a verified webhook handler — this is the only
    place subscription status transitions actually happen, since webhooks
    are the source of truth for what Paystack actually charged.

    Enforces the same day-1-payment rule as create_subscription(): a
    client-premium subscription can never be written with status='trialing'.
    Webhooks fire after a real charge event, so in practice this should
    never trip, but it's kept here as defense in depth.
    """
    if plan_code in CLIENT_PREMIUM_PLAN_CODES and status == "trialing":
        raise TrialNotAllowedError(
            "Received a 'trialing' status for a client premium subscription from a webhook — "
            "this plan type must not have trials. Investigate the Paystack plan configuration."
        )

    existing = await get_by_provider_ref(
        db, provider=provider, provider_subscription_id=provider_subscription_id
    )
    if existing:
        existing.status = status
        existing.provider_plan_code = provider_plan_code
        existing.provider_customer_code = provider_customer_code
        existing.current_period_start = current_period_start
        existing.current_period_end = current_period_end
        await db.commit()
        await db.refresh(existing)
        return existing

    return await create_subscription(
        db,
        user_id=user_id,
        profile_id=profile_id,
        provider=provider,
        provider_subscription_id=provider_subscription_id,
        provider_plan_code=provider_plan_code,
        provider_customer_code=provider_customer_code,
        plan_code=plan_code,
        status=status,
        current_period_start=current_period_start,
        current_period_end=current_period_end,
    )


class TrialNotAllowedError(Exception):
    """Raised if code tries to create a 'trialing' subscription for a plan
    type that must be paid from day 1 (currently: client premium)."""


async def create_subscription(
    db: AsyncSession,
    *,
    user_id: UUID,
    profile_id: UUID | None,
    provider: str,
    provider_subscription_id: str,
    plan_code: str,
    status: str,
    provider_plan_code: str | None = None,
    provider_customer_code: str | None = None,
    current_period_start=None,
    current_period_end=None,
) -> Subscription:
    """
    Creates a subscription row. Enforces that client-premium plans can
    never be created with status='trialing' — premium access is payable
    from day 1, so the payment provider webhook/callback that calls this
    should only do so once the first charge has actually succeeded
    (status='active'), not on trial start.
    """
    if plan_code in CLIENT_PREMIUM_PLAN_CODES and status == "trialing":
        raise TrialNotAllowedError(
            "Client premium subscriptions must be created with status='active' "
            "after a successful charge — trials are not offered for this plan."
        )

    sub = Subscription(
        user_id=user_id,
        profile_id=profile_id,
        provider=provider,
        provider_subscription_id=provider_subscription_id,
        provider_plan_code=provider_plan_code,
        provider_customer_code=provider_customer_code,
        plan_code=plan_code,
        status=status,
        current_period_start=current_period_start,
        current_period_end=current_period_end,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub
