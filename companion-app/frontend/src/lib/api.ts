// Typed client for the Amicora FastAPI backend.
import type {
  AdminLevel,
  AdminLevelResponse,
  Booking,
  BookingStatus,
  CancellationPolicy,
  CompanionProfile,
  CompanionshipCategory,
  Conversation,
  FlaggedMessage,
  IdConsentNotice,
  LegalVersions,
  Message,
  PendingVerificationDocument,
  ProfileSearch,
  ReportResponse,
  Review,
  SignupResponse,
  TokenResponse,
  UserRole,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "http://localhost:8000";

const TOKEN_KEY = "amicora_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function extractDetail(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    // FastAPI validation errors: [{msg, loc, ...}]
    if (Array.isArray(d) && d.length) {
      const first = d[0] as { msg?: string };
      if (first?.msg) return first.msg.replace(/^Value error,\s*/, "");
    }
  }
  return fallback;
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  form?: FormData;
  auth?: boolean;
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = "GET", body, query, form, auth = true } = opts;
  const url = new URL(API_BASE + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {};
  if (auth) {
    const t = getToken();
    if (t) headers["Authorization"] = `Bearer ${t}`;
  }
  let payload: BodyInit | undefined;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), { method, headers, body: payload });
  } catch {
    throw new ApiError(
      "Can't reach the server. Is the API running?",
      0,
    );
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(extractDetail(data, `Request failed (${res.status}).`), res.status);
  }
  return data as T;
}

export const api = {
  // --- auth / legal ---
  legalVersions: () => request<LegalVersions>("/auth/legal-versions", { auth: false }),
  signup: (b: {
    email: string;
    password: string;
    phone?: string;
    role: UserRole;
    accept_tos: boolean;
    accept_privacy_policy: boolean;
  }) => request<SignupResponse>("/auth/signup", { method: "POST", body: b, auth: false }),
  login: (email: string, password: string) =>
    request<TokenResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    }),

  // --- verification ---
  idConsentNotice: () =>
    request<IdConsentNotice>("/verification/id-consent-notice", { auth: false }),
  submitIdDocument: (documentType: string, consent: boolean, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ id: string; review_status: string; consent_version: string; message: string }>(
      "/verification/documents",
      { method: "POST", form, query: { document_type: documentType, consent_to_id_processing: consent } },
    );
  },

  // --- profiles ---
  searchProfiles: (q?: { city?: string; category?: CompanionshipCategory; page?: number }) =>
    request<ProfileSearch>("/profiles", { auth: false, query: q }),
  publicProfile: (id: string) =>
    request<CompanionProfile>(`/profiles/${id}`, { auth: false }),
  myProfile: () => request<CompanionProfile>("/profiles/me"),
  createProfile: (b: {
    display_name: string;
    bio?: string;
    city?: string;
    categories?: CompanionshipCategory[];
    indicative_rate_note?: string;
    contact_details?: string;
  }) => request<CompanionProfile>("/profiles", { method: "POST", body: b }),
  updateMyProfile: (b: {
    display_name?: string;
    bio?: string;
    city?: string;
    categories?: CompanionshipCategory[];
    indicative_rate_note?: string;
    contact_details?: string;
  }) => request<CompanionProfile>("/profiles/me", { method: "PATCH", body: b }),
  setListingFee: (profileId: string, monthlyFeeZar: number) =>
    request<CompanionProfile>(`/profiles/${profileId}/listing-fee`, {
      method: "PATCH",
      body: { monthly_fee_zar: monthlyFeeZar },
    }),
  uploadPortfolioImage: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{
      id: string;
      moderation_status: string;
      image_count: number;
      upload_limit: number;
      message: string;
    }>("/profiles/me/media", { method: "POST", form });
  },
  deletePortfolioImage: (mediaId: string) =>
    request<null>(`/profiles/me/media/${mediaId}`, { method: "DELETE" }),
  publishMyProfile: () => request<{ id: string; is_published: boolean; detail: string }>(
    "/profiles/me/publish",
    { method: "POST" },
  ),
  unpublishMyProfile: () => request<{ id: string; is_published: boolean; detail: string }>(
    "/profiles/me/unpublish",
    { method: "POST" },
  ),

  // --- messaging ---
  startConversation: (profileId: string, bookingId?: string) =>
    request<Conversation>("/conversations", {
      method: "POST",
      body: { profile_id: profileId, booking_id: bookingId },
    }),
  myConversations: () => request<Conversation[]>("/conversations/me"),
  conversationMessages: (conversationId: string) =>
    request<Message[]>(`/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: string, body: string) =>
    request<Message>(`/conversations/${conversationId}/messages`, {
      method: "POST",
      body: { body },
    }),

  // --- bookings ---
  createBooking: (b: {
    profile_id: string;
    category: CompanionshipCategory;
    requested_start: string;
    requested_end?: string;
    location_note?: string;
  }) => request<Booking>("/bookings", { method: "POST", body: b }),
  myBookings: () => request<Booking[]>("/bookings/me"),
  setBookingStatus: (id: string, status: BookingStatus) =>
    request<Booking>(`/bookings/${id}/status`, { method: "POST", body: { status } }),

  // --- reviews ---
  profileReviews: (profileId: string) =>
    request<Review[]>(`/profiles/${profileId}/reviews`, { auth: false }),
  createReview: (bookingId: string, b: { rating: number; comment?: string }) =>
    request<Review>(`/bookings/${bookingId}/review`, { method: "POST", body: b }),

  // --- billing ---
  cancellationPolicy: () =>
    request<CancellationPolicy>("/billing/cancellation-policy", { auth: false }),
  startPremiumCheckout: () =>
    request<{ authorization_url: string }>("/billing/premium/checkout", { method: "POST" }),
  cancelPremium: () =>
    request<{ detail: string }>("/billing/premium/cancel", { method: "POST" }),
  startListingCheckout: (profileId: string) =>
    request<{ authorization_url: string }>(`/billing/listing/${profileId}/checkout`, {
      method: "POST",
    }),
  cancelListing: (profileId: string) =>
    request<{ detail: string }>(`/billing/listing/${profileId}/cancel`, { method: "POST" }),

  // --- admin ---
  verificationQueue: () =>
    request<PendingVerificationDocument[]>("/admin/verification-queue"),
  reviewDocument: (
    id: string,
    b: { approve: boolean; extracted_dob?: string; extracted_full_name?: string; rejection_reason?: string },
  ) => request<{ user_id: string; verification_status: VerificationStatusLike; detail: string }>(
    `/verification/documents/${id}/review`,
    { method: "POST", body: b },
  ),
  flaggedMessages: () => request<FlaggedMessage[]>("/messages/flagged"),
  reviewMessage: (id: string, b: { outcome: string; suspend_sender?: boolean }) =>
    request<{ id: string; review_outcome: string }>(`/messages/${id}/review`, {
      method: "POST",
      body: b,
    }),
  pendingReports: () => request<ReportResponse[]>("/reports"),
  resolveReport: (id: string, b: { status: string; resolution_note?: string }) =>
    request<ReportResponse>(`/reports/${id}/resolve`, { method: "POST", body: b }),
  suspendUser: (id: string) =>
    request<{ user_id: string; detail: string }>(`/admin/users/${id}/suspend`, { method: "POST" }),
  reactivateUser: (id: string) =>
    request<{ user_id: string; detail: string }>(`/admin/users/${id}/reactivate`, { method: "POST" }),
  banUser: (id: string) =>
    request<{ user_id: string; detail: string }>(`/admin/users/${id}/ban`, { method: "POST" }),
  unbanUser: (id: string) =>
    request<{ user_id: string; detail: string }>(`/admin/users/${id}/unban`, { method: "POST" }),
  setAdminLevel: (userId: string, level: AdminLevel) =>
    request<AdminLevelResponse>(`/admin/admins/${userId}/level`, {
      method: "POST",
      body: { level },
    }),
};

type VerificationStatusLike = string;
