"""
Application configuration.
Reads from environment variables — never hardcode secrets here.
"""
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- Core ---
    APP_NAME: str = "companion-platform"
    ENV: str = "development"
    SECRET_KEY: str  # used for JWT signing — set via env var
    DATABASE_URL: str  # postgresql+asyncpg://user:pass@host:port/dbname

    # --- Auth ---
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    ALGORITHM: str = "HS256"

    # --- Billing (Paystack) ---
    PAYSTACK_SECRET_KEY: str = ""
    PAYSTACK_PUBLIC_KEY: str = ""
    PAYSTACK_BASE_URL: str = "https://api.paystack.co"
    # Pre-created in the Paystack dashboard (or once via a setup script) —
    # fixed price, so unlike listing plans it doesn't need dynamic creation.
    PAYSTACK_CLIENT_PREMIUM_PLAN_CODE: str = ""
    CLIENT_PREMIUM_MONTHLY_FEE_ZAR: float = 149.00
    # Where Paystack redirects the browser after checkout completes.
    BILLING_CALLBACK_URL: str = "https://example.com/billing/callback"

    # --- Legal document versions (ToS / Privacy Policy acceptance) ---
    # The currently-published version of each legal document. These are the
    # values recorded against a user when they accept at signup, so the
    # platform has a durable, per-user record of *which* version each person
    # agreed to (a POPIA / consent-audit requirement). Bump the relevant
    # version string whenever the corresponding document in legal/ changes
    # materially — existing users keep the version they accepted, and a
    # re-acceptance flow can compare their stored version against these.
    TOS_VERSION: str = "2026-09-01"
    PRIVACY_POLICY_VERSION: str = "2026-09-01"

    # Version of the ID-document processing consent notice. An identity
    # document is *special personal information* under POPIA and requires its
    # own informed, specific consent, separate from general ToS/Privacy
    # acceptance. This version is recorded against each submission (see
    # app/services/id_consent.py). Bump it whenever the notice text changes.
    ID_PROCESSING_CONSENT_VERSION: str = "2026-09-01"

    # --- Age policy ---
    # Platform-enforced minimum age. Intentionally set above the local legal
    # adult age (18) as a risk-management buffer. Do NOT lower this without
    # a deliberate policy decision — it's checked in code, not just docs.
    MINIMUM_AGE_YEARS: int = 21

    # --- Portfolio image limits ---
    # Flat platform ceiling on portfolio images per profile, regardless of
    # subscription tier. Companions/agents must have an active listing
    # subscription to publish at all (see subscriptions.has_active_listing_subscription) —
    # that's a separate gate from this upload cap.
    MAX_PORTFOLIO_IMAGES: int = 10

    # Free/unauthenticated client viewers only see this many of a profile's
    # images. Clients with an active premium subscription see up to
    # MAX_PORTFOLIO_IMAGES (i.e. everything published).
    CLIENT_FREE_VIEW_LIMIT: int = 5

    # --- File storage (S3-compatible) ---
    S3_BUCKET: str = "companion-platform-uploads"
    S3_REGION: str = "af-south-1"
    S3_ENDPOINT_URL: str | None = None  # set if using non-AWS S3-compatible storage

    # --- Verification document retention ---
    # Days to retain raw ID documents after a verification decision is made.
    # Keep this short; POPIA requires data minimization for special personal
    # information like ID numbers.
    ID_DOCUMENT_RETENTION_DAYS: int = 30

    class Config:
        env_file = ".env"


settings = Settings()
