"""
Image policy — two separate concerns:

1. UPLOAD cap (companion/agent side): a flat platform ceiling on how many
   portfolio images a profile can hold, regardless of subscription tier.
   Publishing at all requires an active *listing* subscription (see
   app/repositories/subscriptions.py: has_active_listing_subscription) —
   that's the monthly fee companions/agents pay, enforced separately in
   routes/profiles.py's publish gate, not here.

2. VIEW cap (client side): how many of a profile's images a given viewer
   is shown. Free/unauthenticated viewers see the first
   CLIENT_FREE_VIEW_LIMIT (5) images; viewers with an active client
   premium subscription see up to the full upload cap (10).

Both caps live here as the single choke point so route handlers call
functions instead of hardcoding 5/10 in multiple places.
"""
from app.core.config import settings


class ImageLimitExceeded(Exception):
    def __init__(self, current_count: int, limit: int):
        self.current_count = current_count
        self.limit = limit
        super().__init__(f"Image limit reached: {current_count}/{limit}.")


def get_upload_limit() -> int:
    """Flat platform ceiling on portfolio images per profile (default 10)."""
    return settings.MAX_PORTFOLIO_IMAGES


def enforce_upload_limit(current_count: int) -> None:
    """Call before accepting a new portfolio image upload."""
    limit = get_upload_limit()
    if current_count >= limit:
        raise ImageLimitExceeded(current_count, limit)


def get_client_view_limit(is_premium_client: bool) -> int:
    """
    Free/unauthenticated client viewers: settings.CLIENT_FREE_VIEW_LIMIT (5).
    Clients with an active premium subscription: the full upload cap (10),
    i.e. everything the companion has published.
    """
    return get_upload_limit() if is_premium_client else settings.CLIENT_FREE_VIEW_LIMIT
