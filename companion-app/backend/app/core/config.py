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
    # Featured-listing boost: a one-off charge that floats a profile to the
    # top of Browse (with a "Featured" badge) for FEATURED_LISTING_DAYS days.
    FEATURED_LISTING_FEE_ZAR: float = 200.00
    FEATURED_LISTING_DAYS: int = 7
    # Where Paystack redirects the browser after checkout completes.
    BILLING_CALLBACK_URL: str = "https://example.com/billing/callback"

    # Browser origins allowed to call the API (the Next.js frontend). Comma-
    # separated in the env var; the web UI can't call the API cross-origin
    # without its origin listed here. Set to the deployed frontend URL(s) in
    # production.
    CORS_ORIGINS: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # Version of the subscription refund/cancellation policy notice (see
    # app/services/cancellation_policy.py). Recorded/displayed like the other
    # legal document versions; bump it whenever the policy text changes.
    # NOTE: the policy text is a DRAFT pending South African CPA/attorney
    # review — see the module and the Pre-Launch Compliance Checklist.
    CANCELLATION_POLICY_VERSION: str = "2026-09-01"

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

    # How long a signed portfolio-image URL stays valid (seconds). Portfolio
    # images are stored privately; the profile response hands back short-lived
    # signed URLs rather than public links. Kept modest so a leaked URL expires
    # quickly, but long enough to view a profile comfortably.
    PORTFOLIO_URL_TTL_SECONDS: int = 3600

    # --- Scheduled maintenance jobs (APScheduler) ---
    # When True, the app starts an in-process AsyncIOScheduler on startup that
    # runs the retention-purge and lapsed-listing-unpublish jobs daily.
    # IMPORTANT: in a multi-worker/multi-replica deployment, only ONE process
    # should run the scheduler, or the jobs will fire once per worker. Either
    # run a single dedicated scheduler process with this True and the web
    # workers with it False, or keep the jobs idempotent (they are) and accept
    # the duplication. The jobs can also always be run standalone via
    # `python -m app.jobs.<name>` regardless of this setting.
    SCHEDULER_ENABLED: bool = True
    # IANA timezone the daily job times below are interpreted in.
    SCHEDULER_TIMEZONE: str = "Africa/Johannesburg"
    # Hour (0-23, in SCHEDULER_TIMEZONE) each daily job runs. Staggered so
    # they don't contend. Minute is fixed at 0.
    PURGE_JOB_HOUR: int = 2
    UNPUBLISH_JOB_HOUR: int = 3
    # How often the "available now" listings rotate so each available lister
    # takes a turn at the top of search results.
    AVAILABILITY_ROTATE_MINUTES: int = 30

    # --- File storage (S3-compatible) ---
    S3_BUCKET: str = "companion-platform-uploads"
    S3_REGION: str = "af-south-1"
    # Endpoint the *backend* uses to read/write objects. For AWS leave unset;
    # for a self-hosted store (e.g. MinIO) point at the internal address,
    # e.g. http://minio:9000 inside a Docker network.
    S3_ENDPOINT_URL: str | None = None
    # Endpoint used only to build the short-lived signed URLs handed to the
    # browser. It must be reachable by end-user browsers, so behind MinIO it
    # is the server's public IP/host (e.g. http://203.0.113.10:9000 now, or
    # https://s3.your-domain later) rather than the internal Docker address.
    # Falls back to S3_ENDPOINT_URL when unset (correct for real AWS S3).
    S3_PUBLIC_ENDPOINT_URL: str | None = None

    # --- Verification document retention ---
    # Days to retain raw ID documents after a verification decision is made.
    # Keep this short; POPIA requires data minimization for special personal
    # information like ID numbers.
    ID_DOCUMENT_RETENTION_DAYS: int = 30

    class Config:
        env_file = ".env"


settings = Settings()
