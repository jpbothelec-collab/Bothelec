"""
Subscription refund / cancellation policy — single source of truth.

This is the canonical, versioned policy text the platform discloses to
subscribers and the one place the cancellation *rules* are stated in code.
It mirrors the notice+version pattern used for the ToS/Privacy and ID-consent
notices.

Scope: the ONLY money the platform ever handles is subscription fees —
per-profile monthly *listing* subscriptions and the client *premium*
(image-unlock) subscription. The companionship fee a client pays a companion
for their time is settled off-platform and Amicora is never party to it, so
the platform cannot and does not refund it (see ToS Section 3).

DRAFT — legal review required. South Africa's Consumer Protection Act (CPA)
and Electronic Communications and Transactions Act may impose specific
cancellation/refund requirements (e.g. cooling-off rights, pro-rata
treatment) not yet finalised here. Have a South African attorney review this
text and the open question below before launch. See
legal/Pre-Launch_Compliance_Checklist.md and ToS Section 7.4.

OPEN DECISION (policy + implementation): whether, after a mid-cycle
cancellation, paid access should continue until the end of the already-paid
period (the model this text describes) or end immediately. Honouring
"until period end" requires the billing webhooks to populate
current_period_end, which they do not yet — see README TODO. The current
implementation stops future renewals immediately and lets the payment
provider's webhook flip the subscription to 'canceled'.
"""
from app.core.config import settings

POLICY_TEXT = (
    "Subscriptions (monthly profile listing fees, and the client premium "
    "image-unlock subscription) renew automatically each month until you "
    "cancel. You may cancel at any time from your account. Cancelling stops "
    "any further charges — your subscription will not renew again. "
    "The platform charges only these subscription fees; it is never party to "
    "the companionship fee settled directly between client and companion, so "
    "that amount cannot be refunded through the platform. "
    "Except where South African law (including the Consumer Protection Act) "
    "requires otherwise, subscription fees already charged for the current "
    "period are not refundable on cancellation. If you believe you were "
    "charged in error, contact Amicora support."
)


def current_version() -> str:
    return settings.CANCELLATION_POLICY_VERSION
