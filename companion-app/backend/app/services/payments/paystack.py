"""
Thin async wrapper around the Paystack REST API.

Paystack docs: https://paystack.com/docs/api/

All amounts sent to/received from Paystack are in the smallest currency
unit (kobo for NGN, cents for ZAR) — this module deals exclusively in
integer cents, matching how amounts are stored in our own tables
(monthly_listing_fee_cents, etc.). Conversion to/from display currency
(e.g. ZAR rands) happens at the API/schema boundary, not here.
"""
import hashlib
import hmac

import httpx

from app.core.config import settings


class PaystackError(Exception):
    def __init__(self, message: str, *, status_code: int | None = None, payload: dict | None = None):
        self.status_code = status_code
        self.payload = payload
        super().__init__(message)


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}",
        "Content-Type": "application/json",
    }


async def _request(method: str, path: str, *, json: dict | None = None) -> dict:
    url = f"{settings.PAYSTACK_BASE_URL}{path}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.request(method, url, headers=_headers(), json=json)

    data = resp.json()
    if not data.get("status", False):
        raise PaystackError(
            data.get("message", "Paystack API request failed"),
            status_code=resp.status_code,
            payload=data,
        )
    return data["data"]


async def create_plan(*, name: str, amount_cents: int, interval: str = "monthly") -> dict:
    """
    Creates a Paystack Plan. Used for per-profile listing fees (each
    profile's fee gets its own plan, since Paystack plans are fixed-amount)
    and could also be used to pre-create the fixed client-premium plan.
    Returns the created plan's data, including `plan_code`.
    """
    return await _request(
        "POST", "/plan",
        json={"name": name, "amount": amount_cents, "interval": interval, "currency": "ZAR"},
    )


async def update_plan(plan_code: str, *, amount_cents: int) -> dict:
    """
    Updates an existing plan's amount. Note: Paystack does NOT retroactively
    change amounts for subscribers already on the plan's current billing
    cycle — existing subscribers keep their prior amount until their next
    invoice is generated against the updated plan. Be aware of this when
    editing a profile's listing fee: the change takes effect on the
    subscriber's next renewal, not immediately.
    """
    return await _request("PUT", f"/plan/{plan_code}", json={"amount": amount_cents})


async def initialize_transaction(
    *, email: str, amount_cents: int, plan_code: str | None, metadata: dict, callback_url: str
) -> dict:
    """
    Starts a Paystack checkout session. Returns data including
    `authorization_url` (redirect the browser here) and `reference`.
    If `plan_code` is provided, the transaction is tied to that plan and
    Paystack will set up a recurring subscription once the first charge
    succeeds.
    """
    payload = {
        "email": email,
        "amount": amount_cents,
        "metadata": metadata,
        "callback_url": callback_url,
    }
    if plan_code:
        payload["plan"] = plan_code
    return await _request("POST", "/transaction/initialize", json=payload)


async def verify_transaction(reference: str) -> dict:
    """Confirms a transaction's status server-side — never trust the client-side redirect alone."""
    return await _request("GET", f"/transaction/verify/{reference}")


async def fetch_subscription(code: str) -> dict:
    """
    Fetch a subscription by its Paystack code (SUB_...). The response
    includes `email_token`, which is required to disable the subscription —
    we fetch it on demand rather than persisting it, so there's no long-lived
    cancellation token stored in our DB.
    """
    return await _request("GET", f"/subscription/{code}")


async def disable_subscription(*, code: str, token: str) -> dict:
    """
    Disable (stop auto-renewal of) a subscription. Paystack requires both the
    subscription `code` and its `email_token`. This stops future invoices;
    Paystack then emits a subscription.disable/not_renew webhook, which is
    where our own subscription row's status is actually updated (never here).
    """
    return await _request(
        "POST", "/subscription/disable", json={"code": code, "token": token}
    )


def verify_webhook_signature(raw_body: bytes, signature_header: str | None) -> bool:
    """
    Paystack signs webhook payloads with HMAC-SHA512 using your secret key,
    sent in the x-paystack-signature header. Always verify this before
    trusting a webhook payload — otherwise anyone could POST fake
    'payment succeeded' events to your webhook endpoint.
    """
    if not signature_header:
        return False
    expected = hmac.new(
        settings.PAYSTACK_SECRET_KEY.encode("utf-8"), raw_body, hashlib.sha512
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)
