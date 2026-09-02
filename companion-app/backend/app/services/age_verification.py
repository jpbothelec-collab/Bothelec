"""
Age verification logic.

Design principle: age is NEVER trusted from a self-reported form field.
It is only ever set on the user record once extracted from a reviewed
identity document. This module is the single choke point for that check —
route handlers should call `enforce_minimum_age` rather than comparing
dates themselves, so the 21-year policy lives in exactly one place.
"""
from datetime import date

from app.core.config import settings


class AgeVerificationError(Exception):
    """Raised when a submitted document indicates the person is under the platform minimum age."""

    def __init__(self, dob: date, computed_age: int, minimum_age: int):
        self.dob = dob
        self.computed_age = computed_age
        self.minimum_age = minimum_age
        super().__init__(
            f"Applicant age {computed_age} is below platform minimum of {minimum_age}."
        )


def calculate_age(dob: date, as_of: date | None = None) -> int:
    as_of = as_of or date.today()
    years = as_of.year - dob.year
    had_birthday_this_year = (as_of.month, as_of.day) >= (dob.month, dob.day)
    if not had_birthday_this_year:
        years -= 1
    return years


def enforce_minimum_age(extracted_dob: date) -> int:
    """
    Call this immediately after OCR/manual extraction of a DOB from an
    identity document, BEFORE writing verification_status = 'verified'
    or setting users.date_of_birth.

    Raises AgeVerificationError if the applicant is under the platform
    minimum (21, per settings.MINIMUM_AGE_YEARS) — even though SA's legal
    adult age is 18. This gap is a deliberate risk-management buffer and
    should not be special-cased away for any user.

    Returns the computed age if the check passes.
    """
    age = calculate_age(extracted_dob)
    if age < settings.MINIMUM_AGE_YEARS:
        raise AgeVerificationError(extracted_dob, age, settings.MINIMUM_AGE_YEARS)
    return age
