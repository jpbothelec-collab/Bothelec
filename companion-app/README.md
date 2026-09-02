# Amicora — Project Handoff

South African companionship listing platform (FastAPI + PostgreSQL), branded **Amicora**. Companions/agents list profiles for a monthly fee; clients browse and book companionship time; the companionship fee itself is settled directly between client and companion, off-platform. This document is written as a handoff — it captures what's built, why key decisions were made, and what's left, so work can continue directly in Claude Code without re-deriving context from scratch.

## Business model (read this first — it drives a lot of the code structure)

- **The platform is a listing/introduction service only.** It is never a party to the companionship fee (what a client pays a companion for their time). That separation is deliberate and load-bearing — see `legal/Terms_of_Service.docx` Section 3.
- **Two independent revenue streams, two independent subscription types:**
  1. **Listing Subscription** — companions/agents pay monthly to keep a profile published. Fee is **per-profile**, not per-account, so an agent managing multiple companions can charge each a different rate. No profile can be published without an active listing subscription for that specific profile.
  2. **Premium Subscription** — clients pay monthly for expanded image access. Fixed price, **no trial** — charged in full at signup. This is enforced at the repository layer (`TrialNotAllowedError`), not just in the UI, so it can't be bypassed.
- **Platform minimum age is 21**, deliberately above South Africa's legal majority (18), as a risk-management buffer. Age is never self-reported — only set after admin review of a submitted ID document.
- **Image visibility is tiered by viewer, not by uploader tier**: a profile holds up to 10 images total (flat cap, same for every companion). Free/anonymous clients see the first 5; premium clients see all 10.

## Tech stack

- **Backend**: FastAPI, async SQLAlchemy 2.0, PostgreSQL, Alembic
- **Storage**: S3-compatible (boto3), encrypted at rest, private ACL, signed URLs only
- **Billing**: Paystack (ZAR), dynamic per-profile plans for listing fees, fixed plan for client premium
- **Auth**: JWT (python-jose), Argon2 password hashing

## Directory structure

```
companion-app/
├── backend/
│   ├── app/
│   │   ├── core/            # config, security (JWT/hashing), S3 client
│   │   ├── db/               # async session setup
│   │   ├── dependencies/      # auth dependencies (current user, role guards, optional-auth)
│   │   ├── jobs/               # scheduled maintenance jobs (see below — none are wired to a scheduler yet)
│   │   ├── models/
│   │   │   ├── orm.py          # SQLAlchemy models
│   │   │   └── schemas.py       # Pydantic request/response schemas
│   │   ├── repositories/         # DB access layer, one module per aggregate
│   │   ├── routes/                # FastAPI routers
│   │   ├── services/               # business logic choke points (see "Key design pattern" below)
│   │   └── main.py                  # app assembly, router registration
│   ├── alembic/                      # migration tooling — wraps migrations/001_initial_schema.sql as revision 1
│   ├── migrations/001_initial_schema.sql   # the actual schema, hand-written SQL
│   ├── requirements.txt
│   └── .env.example                   # copy to .env and fill in real values
└── legal/
    ├── Terms_of_Service.docx           # DRAFT — needs SA attorney review before use
    ├── Privacy_Policy.docx               # DRAFT — POPIA-structured, needs SA attorney review
    └── Pre-Launch_Compliance_Checklist.md # consolidated TODO list, see below
```

## Key design pattern: single choke points for cross-cutting rules

Several rules are enforced in exactly one place, and every route/job that needs the rule calls that function rather than reimplementing the check. When modifying business rules, **look here first**:

| Rule | Lives in |
|---|---|
| Minimum age (21+) | `app/services/age_verification.py` |
| Portfolio image upload cap / client view tiers | `app/services/image_limits.py` |
| Booking status transitions (who can do what from which state) | `app/services/booking_state.py` |
| Message solicitation flagging | `app/services/content_moderation.py` |
| Listing/premium subscription status checks, no-trial rule | `app/repositories/subscriptions.py` |
| Profile owner/agent permission check | `app/repositories/companion_profiles.py::can_manage` |
| Admin capability per access tier | `app/services/admin_access.py` |
| Subscription refund/cancellation policy | `app/services/cancellation_policy.py` |

## Setup

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL, SECRET_KEY, S3_*, PAYSTACK_*
pip install -r requirements.txt --break-system-packages
alembic upgrade head
uvicorn app.main:app --reload
```

Interactive API docs at `http://localhost:8000/docs` once running.

## Phase-by-phase summary

1. **Auth & Identity Verification** — signup/login, JWT, ID document upload + admin review workflow that enforces the 21+ floor even against admin override. S3 storage with encryption, signed URLs, and a POPIA retention purge job.
2. **Companion Profiles & Portfolios** — profile CRUD, portfolio image upload/moderation, publish gate.
3. **Subscription Billing** — Paystack integration; per-profile listing plans (dynamically created/synced to fee changes); fixed client premium plan; webhook-driven subscription state (checkout never writes subscription rows directly).
4. **Search & Discovery** — paginated, filterable public search; only published profiles; viewer-aware image gating carried through.
5. **Messaging & Booking Requests** — booking state machine; conversations/messages; automated (heuristic, not exhaustive) solicitation filter that flags-for-review rather than blocking.
6. **Reviews, Trust & Safety, Admin Tools** — post-booking reviews, user reporting tool, admin verification queue, two-tier suspend/ban, audit log, and the auto-unpublish job that closes the "lapsed subscription didn't unpublish" gap found during Phase 4.
7. **Legal & Compliance** — Terms of Service, Privacy Policy, compliance checklist (this repo's `legal/` folder).

## Outstanding TODOs (consolidated from all phases)

These are gaps flagged during the build that are known but not yet resolved. Prioritized roughly by how much they block a safe launch:

### Must resolve before launch
- [x] **ToS/Privacy Policy acceptance capture** — **backend done.** `users` now carries `tos_accepted_at`/`tos_version` and `privacy_accepted_at`/`privacy_version` (schema in `migrations/001_initial_schema.sql`, ORM in `app/models/orm.py`, additive migration `alembic/versions/1a2b3c4d5e6f_*`). `POST /auth/signup` requires `accept_tos` and `accept_privacy_policy` (both must be `true`, enforced on `SignupRequest`, not just the UI) and stamps the acceptance timestamp plus the **server-side** current versions (`settings.TOS_VERSION` / `PRIVACY_POLICY_VERSION`) — the client can't spoof which version was accepted. `GET /auth/legal-versions` exposes the current versions for the signup UI. **Remaining (frontend):** render the two checkboxes linked to the live documents and call `/auth/legal-versions`. Bump the version constants in `app/core/config.py` whenever a legal document materially changes; a re-acceptance flow for existing users on a stale version is not yet built.
- [x] **Explicit consent for ID document submission** — **backend done.** Consent is now its own basis, separate from ToS/Privacy acceptance, and captured per submission. `identity_documents` carries `consent_given_at`/`consent_version` (schema, ORM, migration `alembic/versions/2b3c4d5e6f70_*`). The canonical POPIA consent notice + its version live in one choke point, `app/services/id_consent.py` (mirrors `age_verification`). `POST /verification/documents` now requires `consent_to_id_processing=true` and gates it **before** any storage/processing of the document — no consent, no upload — stamping the acceptance time and notice version on the row. `GET /verification/id-consent-notice` serves the notice text + version for the upload UI. **Remaining (frontend):** show the notice and a distinct consent control on the upload screen. Bump `ID_PROCESSING_CONSENT_VERSION` in `app/core/config.py` whenever the notice text changes.
- [ ] **Register an Information Officer** with South Africa's Information Regulator before processing personal information at scale — a standing legal requirement, not a code change, but blocks launch.
- [ ] **Legal review of Terms of Service and Privacy Policy** by a South African attorney — see `legal/Pre-Launch_Compliance_Checklist.md` for the full list of placeholder fields and open legal questions (refund policy, liability exclusions, data residency disclosure).
- [x] **Schedule the two maintenance jobs** — **done.** `app/scheduler.py` runs both jobs on an in-process APScheduler `AsyncIOScheduler`, started/stopped from `app/main.py`'s lifespan handler: `purge_identity_documents` daily at `PURGE_JOB_HOUR` and `unpublish_expired_listings` daily at `UNPUBLISH_JOB_HOUR` (both in `SCHEDULER_TIMEZONE`, defaults 02:00/03:00 Africa/Johannesburg). Jobs are `coalesce`d with a misfire grace period so a restart doesn't backlog or skip them, and they remain runnable standalone via `python -m app.jobs.<name>`. Controlled by `SCHEDULER_ENABLED` — **when running multiple web workers, set it false on all but one process** (or a dedicated scheduler process) so the jobs fire once, not once per worker. Config in `app/core/config.py`, documented in `.env.example`.

### Should resolve soon after launch
- [x] **Admin access tiering** — **done.** Admin power is subdivided into capabilities (`AdminPermission`: review_verification, moderate_content, suspend_users, ban_users, manage_admins) mapped to three tiers (`AdminLevel`: `moderator` → `manager` → `superadmin`) in the one choke point `app/services/admin_access.py`. Every admin endpoint now gates on a specific capability via `require_admin_permission(...)` instead of blanket `require_role(admin)` — e.g. a `moderator` can review verifications and moderate flagged messages/reports/media but **cannot** suspend or ban accounts; only `superadmin` can ban or assign tiers. Tier lives in `users.admin_level` (schema, ORM, migration `3c4d5e6f7081_*`); `POST /admin/admins/{user_id}/level` (superadmin-only) assigns it. **Compatibility:** a `role=admin` user with `admin_level` NULL keeps full access (so the DB-seeded bootstrap admin isn't locked out); an unrecognised level string gets nothing (fail closed). The first superadmin must be seeded in the DB. **Remaining (frontend/ops):** an admin-management UI, and seed/assign explicit tiers rather than relying on the NULL=full default.
- [ ] **Content moderation filter is a first-pass heuristic** (`app/services/content_moderation.py`) — pattern-matching only, not an exhaustive or ML-based classifier. Flagged in its own docstring as needing a real classification service before being relied on at scale.
- [ ] **OCR for ID document review** — age/identity extraction is currently manual admin entry (`extracted_dob` typed in by a human reviewer). Consider AWS Textract or similar if manual review doesn't scale.
- [~] **Refund/cancellation policy** — **mechanism + policy surface done; final policy wording and one behaviour decision still need legal sign-off.** There was previously no way for a user to cancel a subscription at all (the webhook only reacted to cancellations originating at Paystack). Added: self-service `POST /billing/listing/{profile_id}/cancel` (owner/agent) and `POST /billing/premium/cancel` (client), which stop auto-renewal via Paystack (`paystack.disable_subscription`, fetching the `email_token` on demand — nothing sensitive stored) and audit-log the request. Consistent with the existing invariant, they do **not** write subscription status — the resulting `subscription.disable`/`not_renew` webhook flips the row to `canceled`. The policy itself is now a versioned choke point (`app/services/cancellation_policy.py`, `CANCELLATION_POLICY_VERSION`) exposed at `GET /billing/cancellation-policy`. **Still open (needs an SA attorney):** the policy text is a DRAFT, and one behaviour decision is unresolved — whether a mid-cycle cancellation keeps paid access until the end of the already-paid period or ends it immediately. Honouring "until period end" needs the billing webhooks to populate `current_period_end` (they don't yet); today access ends when the provider's disable webhook marks the row `canceled`. See ToS Section 7.4.

### Nice to have
- [ ] Search filtering by availability/date once a companion calendar concept exists (not built — bookings currently don't check for scheduling conflicts).
- [ ] A real-time or push notification layer for new messages/booking updates (currently pure request/response, no websockets or polling infrastructure).

## Notes for continuing in Claude Code

- All Python files were compiled (`python3 -m py_compile`) and the full FastAPI app was loaded and its OpenAPI schema generated to confirm every route resolves without path conflicts — see the route table in the schema history for the full endpoint list (`/docs` once running gives you the live version).
- The ORM currently only has models for tables actively used in code (`app/models/orm.py`). The raw SQL schema (`migrations/001_initial_schema.sql`) is the source of truth for the full schema; Alembic's initial revision just executes that file directly rather than being auto-generated, since it predates most of the ORM models. Future schema changes should either extend the SQL file + write a matching Alembic revision, or migrate to ORM-first `autogenerate` once all tables have models — worth deciding which pattern to commit to going forward.
