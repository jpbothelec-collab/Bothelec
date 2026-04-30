"""PayFast sandbox integration.

Flow:
  1. Client clicks 'Pay with PayFast' -> `pay_start` view builds a signed form
     posting to https://sandbox.payfast.co.za/eng/process. Browser auto-submits.
  2. User completes sandbox payment on PayFast.
  3. PayFast POSTs ITN (Instant Transaction Notification) to `payfast_notify`
     (server-to-server). We verify signature + amount, mark invoice paid.
  4. User returns to `pay_return` (success) or `pay_cancel`.

For sandbox we use PayFast's public test credentials:
  merchant_id:  10000100
  merchant_key: 46f0cd694581a
  passphrase:   "" (left blank for sandbox unless configured)

In production: replace these with live credentials + HTTPS + signature
passphrase + ITN IP-source validation from PayFast servers.
"""
import hashlib
from urllib.parse import urlencode


SANDBOX_ENDPOINT = "https://sandbox.payfast.co.za/eng/process"
LIVE_ENDPOINT    = "https://www.payfast.co.za/eng/process"

DEFAULT_MERCHANT_ID  = "10000100"
DEFAULT_MERCHANT_KEY = "46f0cd694581a"
DEFAULT_PASSPHRASE   = ""


def _signature(fields: dict, passphrase: str = "") -> str:
    """PayFast signature = md5(urlencoded form sorted in the order provided + optional passphrase).

    PayFast spec: params must be in the order they're POSTed, excluding the
    signature itself, URL-encoded exactly as they'll be sent. Append &passphrase=... if set.
    """
    # Drop empty values and the signature field itself; preserve insertion order.
    payload = "&".join(f"{k}={_pfquote(v)}" for k, v in fields.items() if k != "signature" and v != "" and v is not None)
    if passphrase:
        payload += "&passphrase=" + _pfquote(passphrase)
    return hashlib.md5(payload.encode("utf-8")).hexdigest()


def _pfquote(value) -> str:
    """PayFast URL-encoding: same as application/x-www-form-urlencoded with + for spaces (quote_plus)."""
    from urllib.parse import quote_plus
    return quote_plus(str(value).strip())


def build_form_fields(invoice, request, settings_mod) -> dict:
    """Build the PayFast POST fields for an Invoice."""
    profile = getattr(invoice.client, "client_profile", None)
    company = profile.company_name if profile else invoice.client.username

    merchant_id = getattr(settings_mod, "PAYFAST_MERCHANT_ID", DEFAULT_MERCHANT_ID)
    merchant_key = getattr(settings_mod, "PAYFAST_MERCHANT_KEY", DEFAULT_MERCHANT_KEY)
    passphrase = getattr(settings_mod, "PAYFAST_PASSPHRASE", DEFAULT_PASSPHRASE)

    base = request.build_absolute_uri("/")[:-1]  # http://host:port
    fields = {
        "merchant_id":  merchant_id,
        "merchant_key": merchant_key,
        "return_url":   f"{base}/billing/{invoice.pk}/payfast/return/",
        "cancel_url":   f"{base}/billing/{invoice.pk}/payfast/cancel/",
        "notify_url":   f"{base}/billing/payfast/notify/",
        "name_first":   invoice.client.first_name or company[:50],
        "name_last":    invoice.client.last_name or "Client",
        "email_address": invoice.client.email or "noreply@example.com",
        "m_payment_id": invoice.number,
        "amount":       f"{invoice.total:.2f}",
        "item_name":    f"Abnormal Load Permit {invoice.application.reference}"[:100],
        "item_description": f"Provinces: {', '.join(l.province.code for l in invoice.application.lines.all())}"[:255],
    }
    fields["signature"] = _signature(fields, passphrase)
    return fields


def verify_itn(post_data: dict, settings_mod) -> bool:
    """Verify the ITN signature from a PayFast POST."""
    passphrase = getattr(settings_mod, "PAYFAST_PASSPHRASE", DEFAULT_PASSPHRASE)
    supplied = post_data.get("signature", "")
    # Rebuild signature from POST in same order PayFast sent (preserve dict order).
    ordered = {k: v for k, v in post_data.items() if k != "signature"}
    expected = _signature(ordered, passphrase)
    return supplied == expected


def endpoint(settings_mod) -> str:
    return LIVE_ENDPOINT if getattr(settings_mod, "PAYFAST_LIVE", False) else SANDBOX_ENDPOINT
