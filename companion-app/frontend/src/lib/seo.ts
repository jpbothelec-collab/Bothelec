// SEO helpers: absolute site URL + server-side API fetch (for metadata and
// the sitemap). The browser uses same-origin /api; server components need an
// internal address to reach the backend directly.

export const SITE_URL = (process.env.SITE_URL || "https://amicora.co.za").replace(/\/$/, "");

function serverApiBase(): string {
  return (process.env.INTERNAL_API_BASE || "http://backend:8000").replace(/\/$/, "");
}

/** Fetch JSON from the backend on the server. Returns null on any failure so
 *  metadata/sitemap generation never crashes a page. */
export async function serverFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(serverApiBase() + path, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
