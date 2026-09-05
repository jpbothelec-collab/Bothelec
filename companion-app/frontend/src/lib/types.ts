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

export interface PortfolioMedia {
  id: string;
  media_type: string;
  display_order: number;
  moderation_status: string;
  created_at: string;
  url: string | null; // short-lived signed URL for the image
}

// Matches the backend's CompanionProfileResponse (app/models/schemas.py).
// Used for both the public (viewer-gated) and owner views — image counts and
// images_locked reflect what the current viewer may see.
export interface ProfileDetails {
  main_heading?: string | null;
  area?: string | null;
  age?: string | null;
  build?: string | null;
  height?: string | null;
  hair_colour?: string | null;
  eyes?: string | null;
  language?: string | null;
  smoker?: string | null;
  body_art?: string | null;
  starsign?: string | null;
  likes?: string | null;
  dislikes?: string | null;
  premises_parking?: string | null;
}

export const STAR_SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

// Field order + labels for editing and display. `long` fields use a textarea
// and span the full width; `options` renders a dropdown instead of a text box.
export const PROFILE_DETAIL_FIELDS: {
  key: keyof ProfileDetails;
  label: string;
  long?: boolean;
  options?: string[];
}[] = [
  { key: "main_heading", label: "Main heading", long: true },
  { key: "area", label: "Area" },
  { key: "age", label: "Age" },
  { key: "build", label: "Build" },
  { key: "height", label: "Height" },
  { key: "hair_colour", label: "Hair colour" },
  { key: "eyes", label: "Eyes" },
  { key: "language", label: "Language" },
  { key: "smoker", label: "Smoker", options: ["Yes", "No"] },
  { key: "body_art", label: "Body art" },
  { key: "starsign", label: "Star sign", options: STAR_SIGNS },
  { key: "likes", label: "Likes", long: true },
  { key: "dislikes", label: "Dislikes", long: true },
  { key: "premises_parking", label: "Premises & parking", long: true },
];

export interface CompanionProfile {
  id: string;
  user_id: string;
  agent_id: string | null;
  display_name: string;
  bio: string | null;
  details: ProfileDetails;
  city: string | null;
  categories: CompanionshipCategory[];
  indicative_rate_note: string | null;
  contact_details: string | null;
  price_list_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  agency_name: string | null;
  is_published: boolean;
  published_at: string | null;
  monthly_listing_fee_zar: number;
  average_rating: number | null;
  review_count: number;
  total_image_count: number;
  visible_image_count: number;
  images_locked: boolean;
  media: PortfolioMedia[];
}

export interface ProfileSearch {
  items: CompanionProfile[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface Agency {
  agency_name: string | null;
  agency_code: string;
  background_url: string | null;
  price_list_url: string | null;
  roster: CompanionProfile[];
}

export interface PublicAgency {
  id: string;
  agency_name: string | null;
  background_url: string | null;
  price_list_url: string | null;
  roster: CompanionProfile[];
}

export interface Conversation {
  id: string;
  booking_id: string | null;
  client_id: string;
  companion_id: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface Review {
  id: string;
  booking_id: string;
  author_id: string;
  profile_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
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
  image_url: string | null;
}

export interface PendingMedia {
  id: string;
  profile_id: string;
  display_name: string;
  created_at: string;
  url: string | null;
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

export interface AdminProfileRow {
  id: string;
  display_name: string;
  owner_email: string;
  owner_role: UserRole;
  owner_verification_status: VerificationStatus;
  monthly_listing_fee_zar: number;
  listing_active: boolean;
  listing_is_manual: boolean;
  approved_photo_count: number;
  is_published: boolean;
  is_featured: boolean;
  featured_until: string | null;
}

export interface ProfileActivationResult {
  profile_id: string;
  owner_verification_status: VerificationStatus;
  listing_active: boolean;
  detail: string;
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

export type ReportReason =
  | "harassment"
  | "solicitation"
  | "fraud"
  | "safety_concern"
  | "other";

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: "Harassment or abuse",
  solicitation: "Solicitation of unlawful services",
  fraud: "Fraud or scam",
  safety_concern: "Safety concern",
  other: "Something else",
};
