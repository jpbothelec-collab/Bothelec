"""
Billing orchestration.

Two flows:

1. Listing checkout (companion/agent): the fee is editable per-profile, so
   Paystack plans are created (or re-synced on drift) per profile rather
   than using one static plan for everyone. ensure_listing_plan() is the
   choke point for that sync logic.

2. Premium checkout (client): fixed price, charged immediately with no
   trial — the checkout transaction is initialized directly against the
   pre-created PAYSTACK_CLIENT_PREMIUM_PLAN_CODE. Nothing here creates a
   'trialing' subscription row; that only ever happens once the webhook
   confirms a successful charge (see routes/billing.py's webhook handler).
"""
from uuid import UUID

from app.core.config import settings
from app.models.orm import CompanionProfile
from app.repositories import companion_profiles as profiles_repo
from app.services.payments import paystack


class BillingConfigError(Exception):
    """Raised when required billing configuration (e.g. a plan code) is missing."""


class SubscriptionNotCancelableError(Exception):
    """Raised when a subscription can't be cancelled via the provider (e.g. it
    isn't a real recurring subscription yet, so there's no provider code)."""


# Paystack subscription codes look like "SUB_xxxx"; a plan-linked charge that
# hasn't produced a subscription yet leaves us holding only a transaction
# reference, which can't be disabled.
_PAYSTACK_SUBSCRIPTION_PREFIX = "SUB_"


async def cancel_subscription(sub) -> None:
    """
    Stop auto-renewal of a subscription with the payment provider.

    Deliberately does NOT write to our subscriptions table: subscription
    status is only ever changed by the verified webhook handler (see
    routes/billing.py). This asks Paystack to disable the subscription; the
    resulting subscription.disable/not_renew webhook is what flips our row to
    'canceled'. The email_token required to disable is fetched on demand
    rather than stored.
    """
    code = sub.provider_subscription_id
    if not code or not code.startswith(_PAYSTACK_SUBSCRIPTION_PREFIX):
        raise SubscriptionNotCancelableError(
            "This subscription has no active recurring billing to cancel. If you "
            "just subscribed, wait a few minutes for it to activate and try again."
        )

    remote = await paystack.fetch_subscription(code)
    email_token = remote.get("email_token")
    if not email_token:
        raise SubscriptionNotCancelableError(
            "Could not retrieve the cancellation token for this subscription."
        )

    await paystack.disable_subscription(code=code, token=email_token)


async def ensure_listing_plan(db, profile: CompanionProfile) -> str:
    """
    Returns a Paystack plan_code whose amount matches
    profile.monthly_listing_fee_cents, creating or re-syncing the plan if
    needed. A profile with fee=0 can't be checked out — the caller should
    reject that case before calling this.
    """
    fee = profile.monthly_listing_fee_cents

    if profile.provider_plan_code and profile.provider_plan_synced_fee_cents == fee:
        return profile.provider_plan_code

    if profile.provider_plan_code:
        # Fee changed since the plan was created — update in place. Note
        # Paystack applies this on the subscriber's NEXT renewal, not
        # retroactively (see paystack.update_plan docstring).
        await paystack.update_plan(profile.provider_plan_code, amount_cents=fee)
        plan_code = profile.provider_plan_code
    else:
        plan = await paystack.create_plan(
            name=f"Listing fee — {profile.display_name} ({profile.id})",
            amount_cents=fee,
        )
        plan_code = plan["plan_code"]

    profile.provider_plan_code = plan_code
    profile.provider_plan_synced_fee_cents = fee
    await db.commit()
    await db.refresh(profile)
    return plan_code


async def start_listing_checkout(db, *, profile: CompanionProfile, payer_email: str) -> dict:
    """
    Kicks off checkout for a profile's monthly listing subscription.
    `payer_email` is whoever is paying — the companion themselves, or the
    managing agent if the agent is footing the bill for that profile.
    Returns Paystack's {authorization_url, access_code, reference}.
    """
    if profile.monthly_listing_fee_cents <= 0:
        raise BillingConfigError(
            "This profile's listing fee is not set. Set a fee before starting checkout."
        )

    plan_code = await ensure_listing_plan(db, profile)

    return await paystack.initialize_transaction(
        email=payer_email,
        amount_cents=profile.monthly_listing_fee_cents,
        plan_code=plan_code,
        metadata={
            "purpose": "listing_subscription",
            "profile_id": str(profile.id),
        },
        callback_url=settings.BILLING_CALLBACK_URL,
    )


async def start_featured_checkout(*, profile: CompanionProfile, payer_email: str) -> dict:
    """
    One-off charge to feature a profile for FEATURED_LISTING_DAYS. Not a
    subscription — a single transaction; the webhook (purpose
    'featured_listing') sets/extends featured_until on success.
    """
    amount_cents = round(settings.FEATURED_LISTING_FEE_ZAR * 100)
    if amount_cents <= 0:
        raise BillingConfigError("Featured-listing fee is not configured.")
    return await paystack.initialize_transaction(
        email=payer_email,
        amount_cents=amount_cents,
        plan_code=None,  # one-off, no recurring plan
        metadata={
            "purpose": "featured_listing",
            "profile_id": str(profile.id),
            "days": settings.FEATURED_LISTING_DAYS,
        },
        callback_url=settings.BILLING_CALLBACK_URL,
    )


async def start_premium_checkout(*, client_user_id: UUID, payer_email: str) -> dict:
    """
    Kicks off checkout for a client's premium (image-unlock) subscription.
    Fixed price, no trial — the first charge happens as part of this
    checkout, and the resulting webhook creates the subscription row
    directly as status='active'.
    """
    if not settings.PAYSTACK_CLIENT_PREMIUM_PLAN_CODE:
        raise BillingConfigError(
            "PAYSTACK_CLIENT_PREMIUM_PLAN_CODE is not configured. "
            "Create the plan in Paystack and set it in settings before enabling premium checkout."
        )

    amount_cents = round(settings.CLIENT_PREMIUM_MONTHLY_FEE_ZAR * 100)

    return await paystack.initialize_transaction(
        email=payer_email,
        amount_cents=amount_cents,
        plan_code=settings.PAYSTACK_CLIENT_PREMIUM_PLAN_CODE,
        metadata={
            "purpose": "client_premium_subscription",
            "user_id": str(client_user_id),
        },
        callback_url=settings.BILLING_CALLBACK_URL,
    )
