import { API_URL } from "./config";
import { storage } from "./storage";
import type { Earnings, Point, Quote, Ride, RideRequestOffer, User } from "./types";

export const TOKEN_KEY = "auth_token";

export class ApiError extends Error {
  constructor(message: string, public status: number, public fields?: Record<string, string[]>) {
    super(message);
  }
}

// Called when the server rejects our token so the app can return to the login screen.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

type Query = Record<string, string | number>;

export async function request<T>(
  method: "GET" | "POST",
  path: string,
  { body, query, token }: { body?: object; query?: Query; token?: string | null } = {},
): Promise<T> {
  const auth = token === undefined ? await storage.get(TOKEN_KEY) : token;
  const qs = query
    ? "?" + Object.entries(query).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&")
    : "";
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1/${path}${qs}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(auth ? { Authorization: `Token ${auth}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && auth) onUnauthorized?.();
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.fields);
  }
  return data as T;
}

const at = (prefix: string, p: Point) => ({ [`${prefix}_lat`]: p.lat, [`${prefix}_lng`]: p.lng });

export const api = {
  login: (username: string, password: string, app: string) =>
    request<{ token: string; user: User }>("POST", "auth/login/", { body: { username, password, app }, token: null }),
  signup: (role: "rider" | "driver", fields: Record<string, string>) =>
    request<{ token: string; user: User }>("POST", `auth/signup/${role}/`, { body: fields, token: null }),
  logout: (pushToken?: string | null) => request<{ ok: true }>("POST", "auth/logout/", { body: { push_token: pushToken } }),
  me: () => request<User>("GET", "me/"),
  registerDevice: (token: string, platform: string) =>
    request<{ ok: true }>("POST", "devices/", { body: { token, platform } }),

  quote: (pickup: Point, dropoff: Point) =>
    request<Quote>("GET", "fare-estimate/", { query: { ...at("pickup", pickup), ...at("dropoff", dropoff) } }),
  nearbyDrivers: (p: Point) =>
    request<{ drivers: (Point & { vehicle_class: string })[] }>("GET", "nearby-drivers/", { query: at("at", p) }),
  requestRide: (body: {
    pickup: Point & { address: string }; dropoff: Point & { address: string };
    vehicle_class: string; payment_method: "cash" | "card";
  }) =>
    request<Ride>("POST", "rides/", {
      body: {
        ...at("pickup", body.pickup), pickup_address: body.pickup.address,
        ...at("dropoff", body.dropoff), dropoff_address: body.dropoff.address,
        vehicle_class: body.vehicle_class, payment_method: body.payment_method,
      },
    }),
  rides: () => request<{ rides: Ride[] }>("GET", "rides/"),
  activeRide: () => request<{ ride: Ride | null }>("GET", "rides/active/"),
  ride: (id: number) => request<Ride>("GET", `rides/${id}/`),
  cancel: (id: number) => request<Ride>("POST", `rides/${id}/cancel/`),
  rate: (id: number, stars: number) => request<Ride>("POST", `rides/${id}/rate/`, { body: { stars } }),

  setOnline: (online: boolean) => request<User>("POST", "driver/status/", { body: { online } }),
  sendLocation: (p: Point, token?: string | null) =>
    request<{ ok: true }>("POST", "driver/location/", { body: at("at", p), token }),
  offers: () => request<{ online: boolean; requests: RideRequestOffer[] }>("GET", "driver/requests/"),
  accept: (id: number) => request<Ride>("POST", `driver/rides/${id}/accept/`),
  advance: (id: number, action: "arrive" | "start" | "complete") =>
    request<Ride>("POST", `driver/rides/${id}/advance/`, { body: { action } }),
  earnings: () => request<Earnings>("GET", "driver/earnings/"),
};
