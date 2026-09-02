"""
ID-document processing consent — single choke point.

An identity document is *special personal information* under POPIA (it
carries an ID number and identity data), so processing it requires its own
informed, specific consent that is separate from the blanket Terms of
Service / Privacy Policy acceptance captured at signup (see TODO #1). This
module is the one place that:

  - holds the canonical consent notice the user is shown, and its version,
  - decides whether a given submission may proceed (`require_consent`).

Route handlers should call `require_consent` rather than checking a bool
themselves, so the consent rule lives in exactly one place — the same
pattern as `age_verification.enforce_minimum_age`.
"""
from app.core.config import settings

# The exact text the user affirmatively agrees to when submitting an ID
# document. POPIA consent must be informed and specific: it names what is
# processed, why, how long it is kept, and that consent can be withdrawn.
# When this text changes materially, bump settings.ID_PROCESSING_CONSENT_VERSION.
CONSENT_NOTICE = (
    "I explicitly consent to Amicora processing the identity document I am "
    "submitting as special personal information under the Protection of "
    "Personal Information Act (POPIA), for the sole purpose of verifying my "
    "identity and confirming that I meet the platform's minimum age of 21. "
    "I understand the document is stored encrypted, is accessible only to "
    "authorised reviewers, and that the stored file is deleted after the "
    f"retention period of {settings.ID_DOCUMENT_RETENTION_DAYS} days once a "
    "review decision has been made. I understand I may withdraw this consent "
    "at any time by contacting Amicora, and that doing so will end my "
    "verification and may prevent continued use of the platform."
)


class ConsentNotProvidedError(Exception):
    """Raised when an ID document is submitted without explicit processing consent."""

    def __init__(self) -> None:
        super().__init__(
            "Explicit consent to process your identity document is required "
            "before it can be submitted."
        )


def current_version() -> str:
    """The version of the consent notice currently in force."""
    return settings.ID_PROCESSING_CONSENT_VERSION


def require_consent(consent_given: bool) -> str:
    """
    Call this before storing or processing a submitted ID document.

    Raises ConsentNotProvidedError unless the user has affirmatively given
    consent (consent_given is True). Returns the consent notice version to
    record against the submission, so there is a durable, per-document audit
    trail of exactly which notice was agreed to.
    """
    if consent_given is not True:
        raise ConsentNotProvidedError()
    return current_version()
