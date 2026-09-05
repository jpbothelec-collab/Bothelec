"""
Admin access tiering — single source of truth for admin capabilities.

Previously any user with role='admin' had every admin power (verification
review, content moderation, and account suspension/ban). This module
subdivides that into named capabilities (AdminPermission) and maps each
admin tier (schemas.AdminLevel) to the set of capabilities it grants.

Route handlers gate on a specific capability via
`dependencies.auth.require_admin_permission(...)`, which calls
`permissions_for` here — so what each tier can do lives in exactly one
place, the same choke-point pattern as age_verification / id_consent.

Legacy/bootstrap compatibility: a user with role='admin' but no admin_level
set is treated as a superadmin. This preserves the pre-tiering behaviour
(and avoids locking out the first, DB-seeded admin) — assign explicit
tiers to narrow access. A role='admin' user with an *unrecognised*
admin_level string gets no permissions (fail closed).
"""
from enum import Enum

from app.models.schemas import AdminLevel, UserRole


class AdminPermission(str, Enum):
    REVIEW_VERIFICATION = "review_verification"   # verification queue + ID document review
    MODERATE_CONTENT = "moderate_content"         # flagged messages, reports, portfolio media
    SUSPEND_USERS = "suspend_users"               # soft suspend / reactivate
    BAN_USERS = "ban_users"                        # hard ban / unban (blocks login)
    MANAGE_ADMINS = "manage_admins"                # assign admin tiers to other admins
    MANAGE_BILLING = "manage_billing"              # manually activate/deactivate a profile's listing


ALL_PERMISSIONS: frozenset[AdminPermission] = frozenset(AdminPermission)

# Tier -> capabilities. Each higher tier is a superset of the one below it.
_MODERATOR = frozenset({
    AdminPermission.REVIEW_VERIFICATION,
    AdminPermission.MODERATE_CONTENT,
})
_MANAGER = _MODERATOR | {AdminPermission.SUSPEND_USERS, AdminPermission.MANAGE_BILLING}
_SUPERADMIN = ALL_PERMISSIONS

LEVEL_PERMISSIONS: dict[AdminLevel, frozenset[AdminPermission]] = {
    AdminLevel.moderator: _MODERATOR,
    AdminLevel.manager: frozenset(_MANAGER),
    AdminLevel.superadmin: frozenset(_SUPERADMIN),
}


def permissions_for(user) -> frozenset[AdminPermission]:
    """
    Effective admin capabilities for a user.

    - Non-admin roles: none.
    - role='admin', admin_level unset: all (legacy/bootstrap — see module docstring).
    - role='admin', known level: that tier's set.
    - role='admin', unknown level string: none (fail closed).
    """
    if user.role != UserRole.admin.value:
        return frozenset()

    level = getattr(user, "admin_level", None)
    if level is None:
        return ALL_PERMISSIONS
    try:
        return LEVEL_PERMISSIONS[AdminLevel(level)]
    except ValueError:
        return frozenset()


def has_permission(user, permission: AdminPermission) -> bool:
    return permission in permissions_for(user)
