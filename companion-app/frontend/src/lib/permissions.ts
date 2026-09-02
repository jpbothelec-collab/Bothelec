// Mirror of the backend's app/services/admin_access.py capability tiers.
// The server is authoritative (it re-checks every request); this is only so
// the UI can hide controls a tier can't use.
import type { AdminLevel } from "./types";

export type AdminPermission =
  | "review_verification"
  | "moderate_content"
  | "suspend_users"
  | "ban_users"
  | "manage_admins";

const MODERATOR: AdminPermission[] = ["review_verification", "moderate_content"];
const MANAGER: AdminPermission[] = [...MODERATOR, "suspend_users"];
const SUPERADMIN: AdminPermission[] = [
  ...MANAGER,
  "ban_users",
  "manage_admins",
];

export const LEVEL_PERMISSIONS: Record<AdminLevel, AdminPermission[]> = {
  moderator: MODERATOR,
  manager: MANAGER,
  superadmin: SUPERADMIN,
};

// The JWT only carries role, not admin_level, so the UI can't know a
// signed-in admin's exact tier from the token alone. We therefore show all
// admin controls to any admin and let the server reject (403) what their tier
// disallows — surfaced as a clear message. When an admin_level is known (e.g.
// after fetching it), callers can use hasPermission for finer hiding.
export function hasPermission(level: AdminLevel | null, perm: AdminPermission): boolean {
  if (!level) return true; // unknown tier -> optimistic; server enforces
  return LEVEL_PERMISSIONS[level].includes(perm);
}
