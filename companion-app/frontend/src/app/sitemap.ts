import type { MetadataRoute } from "next";
import { SITE_URL, serverFetch } from "@/lib/seo";
import { CITIES, CATEGORIES } from "@/lib/landing";

interface ProfileLite {
  id: string;
}
interface SearchResp {
  items: ProfileLite[];
  total_pages: number;
}

// Rebuild the sitemap hourly so newly published profiles appear.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPaths: { path: string; priority: number }[] = [
    { path: "/", priority: 1 },
    { path: "/browse", priority: 0.9 },
    { path: "/legal/terms", priority: 0.4 },
    { path: "/legal/privacy", priority: 0.4 },
    { path: "/parental-controls", priority: 0.4 },
  ];
  const staticEntries: MetadataRoute.Sitemap = staticPaths.map((s) => ({
    url: `${SITE_URL}${s.path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: s.priority,
  }));

  // City and category SEO hub pages.
  const hubEntries: MetadataRoute.Sitemap = [
    ...CITIES.map((c) => `/companions/in/${c.slug}`),
    ...CATEGORIES.map((c) => `/companions/for/${c.slug}`),
  ].map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Published companion profiles (public search only returns published ones).
  const profileEntries: MetadataRoute.Sitemap = [];
  for (let page = 1; page <= 40; page++) {
    const resp = await serverFetch<SearchResp>(`/profiles?page=${page}&page_size=50`);
    if (!resp || !resp.items?.length) break;
    for (const p of resp.items) {
      profileEntries.push({
        url: `${SITE_URL}/companions/${p.id}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
    if (page >= (resp.total_pages || 1)) break;
  }

  return [...staticEntries, ...hubEntries, ...profileEntries];
}
