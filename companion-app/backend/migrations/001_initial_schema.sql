-- ============================================================
-- Companion Platform — Initial Schema
-- PostgreSQL 14+
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('client', 'companion', 'agent', 'admin');

CREATE TYPE verification_status AS ENUM (
    'unverified',       -- just signed up, no ID submitted
    'pending_review',   -- ID submitted, awaiting admin/automated review
    'verified',         -- passed verification, age + identity confirmed
    'rejected',         -- failed verification (bad doc, underage, mismatch)
    'suspended'         -- previously verified, now suspended (fraud, report, etc.)
);

CREATE TYPE subscription_status AS ENUM (
    'trialing', 'active', 'past_due', 'canceled', 'expired'
);

CREATE TYPE booking_status AS ENUM (
    'requested', 'accepted', 'declined', 'canceled', 'completed', 'no_show'
);

CREATE TYPE companionship_category AS ENUM (
    'dinner_date', 'event_plus_one', 'travel_companion', 'social_outing', 'other'
);

-- ------------------------------------------------------------
-- USERS (core auth identity — one row per person, any role)
-- ------------------------------------------------------------

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email               CITEXT UNIQUE NOT NULL,
    phone               TEXT UNIQUE,
    password_hash       TEXT NOT NULL,              -- bcrypt/argon2 hash, never plaintext
    role                user_role NOT NULL,

    -- Age gate: platform minimum is 21, enforced at application layer too,
    -- but we store verified DOB here once confirmed via ID document.
    date_of_birth        DATE,                       -- only set once verified, not self-reported at signup
    verification_status  verification_status NOT NULL DEFAULT 'unverified',
    verified_at           TIMESTAMPTZ,

    -- Admin access tier, only meaningful when role='admin'. NULL is treated
    -- as full (superadmin) access for backward compatibility with pre-tiering
    -- bootstrap admins; assign an explicit tier to narrow access. See
    -- app/services/admin_access.py.
    admin_level          TEXT,

    -- Legal acceptance capture (POPIA / consent audit). Every account must
    -- have accepted the Terms of Service and Privacy Policy at signup; we
    -- record when they accepted and which version, so the agreement is
    -- provable per-user and a re-acceptance flow can detect stale versions.
    tos_accepted_at        TIMESTAMPTZ,
    tos_version            TEXT,
    privacy_accepted_at    TIMESTAMPTZ,
    privacy_version        TEXT,

    is_active            BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_verification_status ON users(verification_status);

-- ------------------------------------------------------------
-- ID VERIFICATION DOCUMENTS
-- Stored separately from users table — sensitive, access-controlled,
-- short retention window per your POPIA policy.
-- ------------------------------------------------------------

CREATE TABLE identity_documents (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    document_type       TEXT NOT NULL,               -- 'sa_id', 'passport'
    document_number_enc BYTEA NOT NULL,               -- encrypted at rest (pgcrypto / app-level KMS)
    storage_path         TEXT,                          -- pointer to encrypted S3 object; nulled by retention purge job after review
    extracted_dob         DATE,                         -- OCR/manual extraction result
    extracted_full_name   TEXT,

    review_status        verification_status NOT NULL DEFAULT 'pending_review',
    reviewed_by           UUID REFERENCES users(id),    -- admin who reviewed it
    reviewed_at            TIMESTAMPTZ,
    rejection_reason      TEXT,

    -- POPIA special-PI consent, captured per submission (separate from the
    -- ToS/Privacy acceptance on the users row). Records when consent was
    -- given and which version of the consent notice was shown.
    consent_given_at      TIMESTAMPTZ,
    consent_version        TEXT,

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_identity_documents_user ON identity_documents(user_id);
CREATE INDEX idx_identity_documents_status ON identity_documents(review_status);

-- Retention job note: schedule a periodic task to purge storage_path
-- objects + this row N days after verified_at, per your data retention policy.

-- ------------------------------------------------------------
-- COMPANION PROFILES (portfolio, bio, rates — public-facing)
-- ------------------------------------------------------------

CREATE TABLE companion_profiles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    agent_id            UUID REFERENCES users(id),      -- set if managed by an agent account

    display_name        TEXT NOT NULL,
    bio                  TEXT,
    city                  TEXT,
    categories            companionship_category[] NOT NULL DEFAULT '{}',

    -- Rate is disclosed here as informational; the actual booking fee is
    -- settled directly between client and companion/agent, off-platform.
    indicative_rate_note  TEXT,

    -- Monthly platform LISTING fee for this specific profile. Set by the
    -- companion (self-managed) or by the managing agent. Agents can set a
    -- different fee per companion they manage — this is NOT the booking
    -- fee, which is settled off-platform between client and companion.
    monthly_listing_fee_cents INTEGER NOT NULL DEFAULT 0,  -- store as integer cents, currency ZAR

    -- Paystack plan synced to the fee above. provider_plan_synced_fee_cents
    -- lets billing code detect drift (fee edited since last sync) and
    -- create a fresh plan rather than silently charging a stale amount.
    provider_plan_code           TEXT,
    provider_plan_synced_fee_cents INTEGER,

    is_published          BOOLEAN NOT NULL DEFAULT FALSE,  -- can only flip TRUE if user.verification_status = 'verified'
    published_at            TIMESTAMPTZ,

    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_companion_profiles_city ON companion_profiles(city);
CREATE INDEX idx_companion_profiles_published ON companion_profiles(is_published);

CREATE TABLE portfolio_media (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id          UUID NOT NULL REFERENCES companion_profiles(id) ON DELETE CASCADE,
    storage_path         TEXT NOT NULL,
    media_type            TEXT NOT NULL,                -- 'image'
    display_order         INT NOT NULL DEFAULT 0,
    moderation_status     TEXT NOT NULL DEFAULT 'pending', -- 'pending','approved','rejected'
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_portfolio_media_profile ON portfolio_media(profile_id);

-- ------------------------------------------------------------
-- SUBSCRIPTIONS (platform access fee — this is what the app charges)
-- ------------------------------------------------------------

CREATE TABLE subscriptions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Set for LISTING subscriptions (one per companion profile — lets an
    -- agent pay a different fee per companion they manage). NULL for
    -- client premium view subscriptions, which aren't tied to a profile.
    profile_id            UUID REFERENCES companion_profiles(id) ON DELETE CASCADE,

    provider              TEXT NOT NULL,                -- 'paystack', 'payfast', 'stripe'
    provider_subscription_id TEXT NOT NULL,
    provider_plan_code     TEXT,                          -- Paystack plan code this subscription is on
    provider_customer_code TEXT,                          -- Paystack customer code, for repeat checkouts
    plan_code             TEXT NOT NULL,
    status                subscription_status NOT NULL DEFAULT 'trialing',

    current_period_start   TIMESTAMPTZ,
    current_period_end     TIMESTAMPTZ,
    canceled_at             TIMESTAMPTZ,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_profile ON subscriptions(profile_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE UNIQUE INDEX idx_subscriptions_provider_ref ON subscriptions(provider, provider_subscription_id);

-- ------------------------------------------------------------
-- BOOKINGS
-- Note: the platform records the booking request/coordination only.
-- The companionship fee itself is agreed and settled directly between
-- client and companion/agent — the platform is not a party to that
-- payment. `agreed_fee_note` is informational/free-text, not a charge.
-- ------------------------------------------------------------

CREATE TABLE bookings (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id           UUID NOT NULL REFERENCES users(id),
    profile_id          UUID NOT NULL REFERENCES companion_profiles(id),

    category              companionship_category NOT NULL,
    requested_start        TIMESTAMPTZ NOT NULL,
    requested_end            TIMESTAMPTZ,
    location_note            TEXT,

    status                  booking_status NOT NULL DEFAULT 'requested',
    agreed_fee_note          TEXT,                       -- informational only; not processed by platform

    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bookings_client ON bookings(client_id);
CREATE INDEX idx_bookings_profile ON bookings(profile_id);
CREATE INDEX idx_bookings_status ON bookings(status);

-- ------------------------------------------------------------
-- MESSAGING (pre-booking coordination)
-- ------------------------------------------------------------

CREATE TABLE conversations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id          UUID REFERENCES bookings(id) ON DELETE SET NULL,
    client_id           UUID NOT NULL REFERENCES users(id),
    companion_id        UUID NOT NULL REFERENCES users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id     UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id           UUID NOT NULL REFERENCES users(id),
    body                  TEXT NOT NULL,

    -- flagged_reason gets set by an automated content filter if a message
    -- appears to solicit sexual services — routes to admin review queue.
    flagged_reason         TEXT,
    reviewed_at             TIMESTAMPTZ,
    reviewed_by              UUID REFERENCES users(id),
    review_outcome            TEXT,  -- 'dismissed' or 'confirmed_violation'

    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_flagged ON messages(flagged_reason) WHERE flagged_reason IS NOT NULL;

-- ------------------------------------------------------------
-- REVIEWS
-- ------------------------------------------------------------

CREATE TABLE reviews (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    booking_id          UUID NOT NULL UNIQUE REFERENCES bookings(id),
    author_id           UUID NOT NULL REFERENCES users(id),
    profile_id          UUID NOT NULL REFERENCES companion_profiles(id),
    rating                SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment                TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reviews_profile ON reviews(profile_id);

CREATE TYPE report_status AS ENUM ('pending', 'resolved', 'dismissed');

-- ------------------------------------------------------------
-- USER REPORTS
-- Lets any user flag another user (harassment, safety concerns,
-- suspected solicitation, fraud, etc.) for admin review — distinct from
-- the automated message content filter, which only catches text patterns.
-- ------------------------------------------------------------

CREATE TABLE user_reports (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id         UUID NOT NULL REFERENCES users(id),
    reported_user_id    UUID NOT NULL REFERENCES users(id),
    reason                TEXT NOT NULL,       -- free-text category: 'harassment', 'solicitation', 'fraud', 'safety_concern', 'other'
    details                TEXT,
    related_booking_id      UUID REFERENCES bookings(id),

    status                  report_status NOT NULL DEFAULT 'pending',
    resolution_note           TEXT,
    reviewed_by                UUID REFERENCES users(id),
    reviewed_at                  TIMESTAMPTZ,

    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_reports_reporter ON user_reports(reporter_id);
CREATE INDEX idx_user_reports_reported ON user_reports(reported_user_id);
CREATE INDEX idx_user_reports_status ON user_reports(status);

-- ------------------------------------------------------------
-- AUDIT LOG (admin actions — verification decisions, suspensions, etc.)
-- ------------------------------------------------------------

CREATE TABLE audit_log (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id             UUID REFERENCES users(id),
    action                TEXT NOT NULL,
    target_type            TEXT NOT NULL,
    target_id               UUID,
    metadata                 JSONB,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_target ON audit_log(target_type, target_id);
