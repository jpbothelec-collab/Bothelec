# Pre-Launch Legal & Compliance Checklist

This checklist ties together the legal/compliance items across all build phases. It is not legal advice — treat it as a punch list to work through with a South African attorney before launch.

## 1. Legal review (highest priority)

- [ ] **Confirm "Amicora" is available**: run a CIPC company/business name search, a South African trademark search, and confirm domain (.co.za and .com) and social handle availability before formally registering the business or filing a trademark. Web searches during naming discussion turned up no direct competitor using this name, but that is not a substitute for the formal registries.
- [ ] **Engage a South African attorney** with experience in adjacent-industry regulatory risk (escort/companion services sit close to conduct regulated under the Sexual Offences Act) to review the Terms of Service and confirm the platform's positioning — introduction/listing service, not a party to companionship fees — is legally sound as structured, not just as worded.
- [ ] Confirm with counsel whether operating a companion/escort-adjacent listing platform in South Africa requires any specific business licensing beyond standard company registration.
- [ ] Fill in all `[BRACKETED]` placeholders in `Terms_of_Service.docx` and `Privacy_Policy.docx` (company legal name, registration number, physical address, contact details, payment processor name).
- [ ] Finalize the refund/cancellation policy (Section 7.4 of the ToS) — South African consumer protection law (CPA) may impose requirements here that the current draft flags but doesn't resolve.
- [ ] Finalize the liability/indemnity language (Sections 14–15 of the ToS) with counsel — broad exclusions may not be fully enforceable under the CPA.

## 2. POPIA compliance

- [ ] **Register an Information Officer** with the Information Regulator before processing personal information at scale — this is a standing legal requirement, not optional.
- [ ] Confirm data residency: is identity document / portfolio storage (S3-compatible bucket, see `S3_ENDPOINT_URL` in `.env`) hosted in South Africa or cross-border? If cross-border, confirm POPIA section 72 transfer conditions are met and disclose this in the Privacy Policy.
- [ ] Confirm the `ID_DOCUMENT_RETENTION_DAYS` value (currently 30, in `app/core/config.py`) matches what's stated in the Privacy Policy, and that the retention job (`app/jobs/purge_identity_documents.py`) is actually scheduled to run (cron/APScheduler) — the code exists but scheduling it is a deployment step.
- [ ] Draft an internal data breach response procedure (who does what within what timeframe) to satisfy the notification obligation described in Privacy Policy Section 9.

## 3. Age & identity verification (built — verify configuration before launch)

- [x] Platform-enforced minimum age of 21 (`MINIMUM_AGE_YEARS` in config), separate from South Africa's legal majority age of 18.
- [x] Age is never self-reported — only set after admin review of a submitted ID document (`app/services/age_verification.py`).
- [ ] Confirm the identity document review process (currently manual admin review) has adequate staffing/SLA before launch — a slow queue blocks companions from publishing and clients from booking.
- [ ] Consider whether OCR-assisted extraction (e.g. AWS Textract) is worth adding before launch to reduce manual review load, or whether manual-only is acceptable at initial scale.

## 4. Fee structure disclosure (built — confirm ToS wording matches)

- [x] Listing Subscription is per-profile, editable by the companion or managing agent, mandatory to publish (`has_active_listing_subscription`, checked at publish time).
- [x] Client Premium Subscription is charged from day one — no trial (`TrialNotAllowedError` enforced at the repository layer).
- [x] Auto-unpublish job for lapsed listing subscriptions (`app/jobs/unpublish_expired_listings.py`) — confirm this is scheduled to run.
- [ ] Confirm the ToS's billing section (7.1–7.4) is consistent with what's actually configured in Paystack (plan amounts, renewal timing, the fee-update-takes-effect-next-cycle behavior noted in `services/billing.py`).

## 5. Content moderation & prohibited conduct

- [x] Automated message screening for solicitation language (`app/services/content_moderation.py`) — flagged as a first-pass heuristic, not exhaustive.
- [x] Admin review queue for flagged messages (`GET /messages/flagged`) and user reports (`GET /reports`).
- [x] Portfolio image moderation queue before publishing.
- [ ] Before launch, have an actual human (not just the automated filter) spot-check a sample of test conversations to gauge false-positive/false-negative rates, and budget for improving the filter (or adding a real classification service) post-launch.
- [ ] Confirm the ToS's Prohibited Conduct section (5) matches what the moderation system actually enforces — don't promise stricter enforcement than the system delivers, or looser enforcement than the ToS commits to.

## 6. Trust & safety operations

- [x] Two-tier account action: suspension (soft, blocks publishing/booking/messaging) vs. ban (hard, blocks login) — confirm your admin team understands when to use which.
- [x] Audit log for all admin actions (`app/repositories/audit_log.py`).
- [ ] Write an internal escalation procedure for safety incidents reported after an in-person meeting (the ToS disclaims the Company's liability for what happens at a Booking, but you likely still want an internal process for handling serious reports responsibly).
- [ ] Decide who has admin access and how that access is provisioned/revoked — this isn't yet built as a distinct concern (currently anyone with `role=admin` has full admin rights).

## 7. Consent & acceptance flow (not yet built — needed before launch)

- [ ] Add an explicit ToS + Privacy Policy acceptance checkbox at signup, with the acceptance timestamp and document version recorded against the user's account (not currently in the schema — would need a small addition, e.g. `users.tos_accepted_at`, `users.tos_version`).
- [ ] Add explicit, separate consent language for identity document submission, given it's POPIA "special personal information" requiring its own consent basis (Privacy Policy Section 2.2 assumes this consent is captured — confirm the actual signup/upload UI does so).

## 8. Business fundamentals

- [ ] Company registration number, physical address, and banking details finalized for insertion into both legal documents.
- [ ] Confirm business insurance (general liability, cyber/data breach) is in place before launch, given the sensitivity of the data being processed.
- [ ] Confirm Paystack (or PayFast) merchant account is fully verified and able to process the specific transaction types used here (recurring subscriptions, dynamically-created plans per listing fee).
