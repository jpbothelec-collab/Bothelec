// Types mirroring the FastAPI backend schemas (app/models/schemas.py).

export type UserRole = "client" | "companion" | "agent" | "admin";
export type AdminLevel = "moderator" | "manager" | "superadmin";
export type VerificationStatus =
  | "unverified"
  | "pending_review"
  | "verified"
  | "rejected"
  | "suspended";
export type CompanionshipCategory =
  | "dinner_date"
  | "event_plus_one"
  | "travel_companion"
  | "social_outing"
  | "other";
export type BookingStatus =
  | "requested"
  | "accepted"
  | "declined"
  | "canceled"
  | "completed"
  | "no_show";

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface SignupResponse {
  id: string;
  email: string;
  role: UserRole;
  verification_status: VerificationStatus;
  tos_version: string;
  privacy_version: string;
  message: string;
}

export interface LegalVersions {
  tos_version: string;
  privacy_policy_version: string;
}

export interface IdConsentNotice {
  version: string;
  notice: string;
}

export interface CancellationPolicy {
  version: string;
  policy: string;
}

export interface PublicProfile {
  id: string;
  display_name: string;
  bio: string | null;
  city: string | null;
  categories: CompanionshipCategory[];
  indicative_rate_note: string | null;
  image_urls: string[];
  images_locked: number; // how many additional images are premium-locked
}

export interface MyProfile {
  id: string;
  display_name: string;
  bio: string | null;
  city: string | null;
  categories: CompanionshipCategory[];
  indicative_rate_note: string | null;
  monthly_listing_fee_cents: number;
  is_published: boolean;
}

export interface Booking {
  id: string;
  profile_id: string;
  client_id: string;
  category: CompanionshipCategory;
  requested_start: string;
  requested_end: string | null;
  location_note: string | null;
  status: BookingStatus;
  agreed_fee_note: string | null;
  created_at: string;
}

export interface PendingVerificationDocument {
  id: string;
  user_id: string;
  document_type: string;
  created_at: string;
}

export interface FlaggedMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  flagged_reason: string | null;
  reviewed_at: string | null;
  review_outcome: string | null;
  created_at: string;
}

export interface ReportResponse {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
}

export interface AdminLevelResponse {
  user_id: string;
  admin_level: AdminLevel;
  permissions: string[];
  detail: string;
}

// Decoded JWT payload from the backend (app/core/security.py)
export interface JwtClaims {
  sub: string; // user id
  role: UserRole;
  exp: number;
}

export const CATEGORY_LABELS: Record<CompanionshipCategory, string> = {
  dinner_date: "Dinner date",
  event_plus_one: "Event plus-one",
  travel_companion: "Travel companion",
  social_outing: "Social outing",
  other: "Other",
};

export const ADMIN_LEVEL_LABELS: Record<AdminLevel, string> = {
  moderator: "Moderator",
  manager: "Manager",
  superadmin: "Super admin",
};
