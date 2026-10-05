/**
 * Address search via OpenStreetMap Nominatim (free, rate-limited to ~1 req/s).
 * For production swap in Google Places / Mapbox for autocomplete quality.
 */
import type { Place } from "./types";

const BASE = "https://nominatim.openstreetmap.org";
const HEADERS = { "Accept-Language": "en", "User-Agent": "BothelecRides/1.0" };

const short = (name: string) => name.split(",").slice(0, 3).join(",").trim();

export async function searchPlaces(query: string, near?: { lat: number; lng: number }): Promise<Place[]> {
  if (query.trim().length < 3) return [];
  let url = `${BASE}/search?format=json&limit=6&countrycodes=za&q=${encodeURIComponent(query)}`;
  if (near) {
    const d = 0.5; // prefer results within ~50 km
    url += `&viewbox=${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`;
  }
  try {
    const res = await fetch(url, { headers: HEADERS });
    const hits = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    return hits.map((h) => ({ lat: +h.lat, lng: +h.lon, address: short(h.display_name) }));
  } catch {
    return [];
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(`${BASE}/reverse?format=json&lat=${lat}&lon=${lng}`, { headers: HEADERS });
    const j = (await res.json()) as { display_name?: string };
    if (j.display_name) return short(j.display_name);
  } catch {
    // fall through
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
