"""
Message content moderation.

This is a first-pass heuristic filter, not a final judgment: it flags
messages that plausibly suggest solicitation of sexual services (which
this platform's Terms of Service explicitly prohibit — the platform only
facilitates companionship/time, not sexual services) so an admin can
review them. Flagged messages are still delivered normally; the filter
is a detection/audit signal, not a blocking gate, since a keyword match
alone is too noisy to justify censoring a conversation in real time.

Deliberately conservative and pattern-level, not an exhaustive or
mechanism-annotated list — this is a starting heuristic that should be
supplemented with a real classification service (or a moderation API)
before relying on it in production. Treat repeated confirmed violations
as grounds for account suspension (see routes/messaging.py's admin
review endpoint), not any single flagged message.
"""
import re

# Patterns are intentionally broad/pattern-level rather than an exhaustive
# enumerated list of explicit terms — the goal is to catch clear cases and
# route them to a human, not to build a comprehensive evasion-proof filter.
_SOLICITATION_PATTERNS = [
    r"\bsex\s*for\s*(cash|money)\b",
    r"\bfull[\s-]*service\b",
    r"\bfs\s*available\b",
    r"\b(anal|oral)\s*sex\b",
    r"\bno\s*condom\b",
    r"\bbareback\b",
    r"\bsexual\s*services?\b",
    r"\bhappy\s*ending\b",
    r"\bextras?\s*(included|available|on\s*top)\b",
]

_COMPILED_PATTERNS = [re.compile(p, re.IGNORECASE) for p in _SOLICITATION_PATTERNS]


def scan_message(body: str) -> str | None:
    """
    Returns a short, generic flagged_reason string if the message body
    matches a solicitation pattern, else None. The returned reason is
    intentionally generic (doesn't quote the matched text or name the
    pattern) so it's safe to store and later surface without teaching
    senders exactly what to rephrase to evade detection.
    """
    for pattern in _COMPILED_PATTERNS:
        if pattern.search(body):
            return "Message flagged: possible solicitation of sexual services (platform ToS prohibits this)."
    return None
