"""
Billing routes.

Checkout endpoints only ever *initiate* a Paystack transaction and hand
back a redirect URL — they never write subscription rows themselves. The
webhook handler is the sole place subscription state changes, since it's
the only signal we actually trust (a browser redirect back to our
callback_url proves nothing; Paystack could be spoofed or the user could
abandon the tab after paying).
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.dependencies.auth import require_role
from app.models.schemas import (
    CancellationPolicyResponse,
    CheckoutResponse,
    SubscriptionCancellationResponse,
    UserRole,
)
from app.repositories import audit_log as audit_repo
from app.repositories import companion_profiles as profiles_repo
from app.repositories import subscriptions as subs_repo
from app.repositories import users as users_repo
from app.services import billing, cancellation_policy
from app.services.payments import paystack

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/cancellation-policy", response_model=CancellationPolicyResponse)
async def get_cancellation_policy():
    """
    The current subscription refund/cancellation policy and its version, for
    the checkout/account UI to display. Informational — the cancellation
    action itself is the /cancel endpoints below.
    """
    return CancellationPolicyResponse(
        version=cancellation_policy.current_version(),
        policy=cancellation_policy.POLICY_TEXT,
    )


@router.post("/listing/{profile_id}/checkout", response_model=CheckoutResponse)
async def start_listing_checkout(
    profile_id: UUID,
    current_user=Depends(require_role(UserRole.companion, UserRole.agent)),
    db: AsyncSession = Depends(get_db),
):
    """
    Starts checkout for a profile's monthly listing subscription. Callable
    by the profile owner or its managing agent — whoever is paying uses
    their own account's email as the billing contact.
    """
    profile = await profiles_repo.get_by_id(db, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")
    if not profiles_repo.can_manage(profile, current_user):
        raise HTTPException(
            status_code=403,
            detail="Only the profile owner or its managing agent can start listing checkout.",
        )

    try:
        result = await billing.start_listing_checkout(
            db, profile=profile, payer_email=current_user.email
        )
    except billing.BillingConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except paystack.PaystackError as e:
        raise HTTPException(status_code=502, detail=f"Payment provider error: {e}")

    return CheckoutResponse(
        authorization_url=result["authorization_url"],
        access_code=result["access_code"],
        reference=result["reference"],
    )


@router.post("/premium/checkout", response_model=CheckoutResponse)
async def start_premium_checkout(
    current_user=Depends(require_role(UserRole.client)),
    db: AsyncSession = Depends(get_db),
):
    """
    Starts checkout for a client's premium (image-unlock) subscription.
    Fixed price, charged immediately — no trial period is offered or
    possible for this plan (enforced again at the webhook/repo layer).
    """
    try:
        result = await billing.start_premium_checkout(
            client_user_id=current_user.id, payer_email=current_user.email
        )
    except billing.BillingConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except paystack.PaystackError as e:
        raise HTTPException(status_code=502, detail=f"Payment provider error: {e}")

    return CheckoutResponse(
        authorization_url=result["authorization_url"],
        access_code=result["access_code"],
        reference=result["reference"],
    )


@router.post("/listing/{profile_id}/cancel", response_model=SubscriptionCancellationResponse)
async def cancel_listing_subscription(
    profile_id: UUID,
    current_user=Depends(require_role(UserRole.companion, UserRole.agent)),
    db: AsyncSession = Depends(get_db),
):
    """
    Cancel a profile's monthly listing subscription (stops auto-renewal).
    Callable by the profile owner or its managing agent. See
    /billing/cancellation-policy for refund terms; the profile will be
    auto-unpublished once the subscription is no longer active (see the
    unpublish_expired_listings job).
    """
    profile = await profiles_repo.get_by_id(db, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found.")
    if not profiles_repo.can_manage(profile, current_user):
        raise HTTPException(
            status_code=403,
            detail="Only the profile owner or its managing agent can cancel this listing.",
        )

    sub = await subs_repo.get_active_listing_subscription(db, profile_id)
    if not sub:
        raise HTTPException(status_code=404, detail="No active listing subscription for this profile.")

    await _cancel(db, sub, actor_id=current_user.id, target_type="companion_profile", target_id=profile_id)
    return SubscriptionCancellationResponse()


@router.post("/premium/cancel", response_model=SubscriptionCancellationResponse)
async def cancel_premium_subscription(
    current_user=Depends(require_role(UserRole.client)),
    db: AsyncSession = Depends(get_db),
):
    """
    Cancel the client's premium (image-unlock) subscription (stops
    auto-renewal). See /billing/cancellation-policy for refund terms.
    """
    sub = await subs_repo.get_active_premium_subscription(db, current_user.id)
    if not sub:
        raise HTTPException(status_code=404, detail="No active premium subscription to cancel.")

    await _cancel(db, sub, actor_id=current_user.id, target_type="user", target_id=current_user.id)
    return SubscriptionCancellationResponse()


async def _cancel(db, sub, *, actor_id, target_type, target_id) -> None:
    """Request provider cancellation and audit it. Status is flipped by the webhook, not here."""
    try:
        await billing.cancel_subscription(sub)
    except billing.SubscriptionNotCancelableError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except paystack.PaystackError as e:
        raise HTTPException(status_code=502, detail=f"Payment provider error: {e}")

    await audit_repo.write(
        db, actor_id=actor_id, action="subscription_cancellation_requested",
        target_type=target_type, target_id=target_id,
        metadata={"subscription_id": str(sub.id), "plan_code": sub.plan_code},
    )


@router.post("/webhooks/paystack", status_code=status.HTTP_200_OK)
async def paystack_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Paystack webhook receiver. Verifies the HMAC signature before trusting
    anything in the payload — an unverified webhook body is just untrusted
    user input from the internet, regardless of which URL it hit.

    Handles the events needed to keep our subscriptions table in sync:
    - charge.success: first payment on a plan-linked transaction succeeded.
    - subscription.create / subscription.not_renew / subscription.disable:
      lifecycle events for a Paystack subscription.
    - invoice.payment_failed: a renewal charge failed.
    """
    raw_body = await request.body()
    signature = request.headers.get("x-paystack-signature")

    if not paystack.verify_webhook_signature(raw_body, signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature.")

    event = await request.json()
    event_type = event.get("event")
    data = event.get("data", {})

    if event_type == "charge.success":
        await _handle_charge_success(db, data)
    elif event_type in ("subscription.disable", "subscription.not_renew"):
        await _handle_subscription_ended(db, data)
    elif event_type == "invoice.payment_failed":
        await _handle_payment_failed(db, data)
    # Unhandled event types are acknowledged with 200 and ignored — Paystack
    # retries on non-2xx, and we don't want retries for events we don't act on.

    return {"received": True}


async def _handle_charge_success(db: AsyncSession, data: dict) -> None:
    metadata = data.get("metadata", {}) or {}
    purpose = metadata.get("purpose")
    customer = data.get("customer", {})
    customer_email = customer.get("email")
    customer_code = customer.get("customer_code")

    plan_data = data.get("plan", {}) or {}
    provider_plan_code = plan_data.get("plan_code")

    # Paystack sends the subscription code on the charge payload once a
    # plan-linked transaction succeeds; fall back to the transaction
    # reference if it's a one-off charge with no subscription attached yet.
    provider_subscription_id = data.get("subscription_code") or data.get("reference")

    if purpose == "listing_subscription":
        profile_id = UUID(metadata["profile_id"])
        profile = await profiles_repo.get_by_id(db, profile_id)
        if not profile:
            return  # profile deleted since checkout started; nothing to reconcile
        payer = await users_repo.get_by_email(db, customer_email)
        if not payer:
            return

        plan_code = "agent_listing_monthly" if payer.role == "agent" else "companion_listing_monthly"
        await subs_repo.upsert_from_webhook(
            db,
            user_id=payer.id,
            profile_id=profile.id,
            provider="paystack",
            provider_subscription_id=provider_subscription_id,
            provider_plan_code=provider_plan_code,
            provider_customer_code=customer_code,
            plan_code=plan_code,
            status="active",
        )

    elif purpose == "client_premium_subscription":
        user_id = UUID(metadata["user_id"])
        await subs_repo.upsert_from_webhook(
            db,
            user_id=user_id,
            profile_id=None,
            provider="paystack",
            provider_subscription_id=provider_subscription_id,
            provider_plan_code=provider_plan_code,
            provider_customer_code=customer_code,
            plan_code="client_premium_monthly",
            status="active",  # never 'trialing' — enforced again in the repo layer
        )


async def _handle_subscription_ended(db: AsyncSession, data: dict) -> None:
    provider_subscription_id = data.get("subscription_code")
    if not provider_subscription_id:
        return
    sub = await subs_repo.get_by_provider_ref(
        db, provider="paystack", provider_subscription_id=provider_subscription_id
    )
    if sub:
        sub.status = "canceled"
        await db.commit()


async def _handle_payment_failed(db: AsyncSession, data: dict) -> None:
    subscription = data.get("subscription", {}) or {}
    provider_subscription_id = subscription.get("subscription_code")
    if not provider_subscription_id:
        return
    sub = await subs_repo.get_by_provider_ref(
        db, provider="paystack", provider_subscription_id=provider_subscription_id
    )
    if sub:
        sub.status = "past_due"
        await db.commit()
