import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Private / account areas — no SEO value, keep out of the index.
        disallow: [
          "/api",
          "/admin",
          "/account",
          "/bookings",
          "/messages",
          "/profile",
          "/agency",
          "/login",
          "/signup",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
