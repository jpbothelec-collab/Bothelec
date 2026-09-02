"""
Booking status transition policy.

Single choke point for which status transitions are valid and who's
allowed to make them, mirroring how age_verification.py and
image_limits.py centralize their respective rules.
"""

# Transitions allowed when the actor is the client who made the request.
_CLIENT_TRANSITIONS: dict[str, set[str]] = {
    "requested": {"canceled"},
    "accepted": {"canceled"},
}

# Transitions allowed when the actor is the companion (or their managing
# agent) who owns the profile being booked.
_COMPANION_TRANSITIONS: dict[str, set[str]] = {
    "requested": {"accepted", "declined"},
    "accepted": {"completed", "no_show", "canceled"},
}


class InvalidBookingTransition(Exception):
    def __init__(self, current_status: str, new_status: str, actor: str):
        self.current_status = current_status
        self.new_status = new_status
        self.actor = actor
        super().__init__(
            f"Cannot transition booking from '{current_status}' to '{new_status}' as {actor}."
        )


def enforce_transition(current_status: str, new_status: str, *, actor: str) -> None:
    """
    actor must be 'client' or 'companion'. Raises InvalidBookingTransition
    if the requested change isn't allowed for that actor from the
    booking's current status.
    """
    table = _CLIENT_TRANSITIONS if actor == "client" else _COMPANION_TRANSITIONS
    allowed = table.get(current_status, set())
    if new_status not in allowed:
        raise InvalidBookingTransition(current_status, new_status, actor)
