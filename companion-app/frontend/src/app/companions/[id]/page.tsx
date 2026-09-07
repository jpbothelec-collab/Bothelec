import type { Metadata } from "next";
import { SITE_URL, serverFetch } from "@/lib/seo";
import CompanionView from "./view";

interface ProfileMeta {
  display_name: string;
  city: string | null;
  categories?: string[];
  details?: { main_heading?: string | null };
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const p = await serverFetch<ProfileMeta>(`/profiles/${params.id}`);
  if (!p) {
    // Not found / not published — keep it out of the index.
    return { title: "Companion", robots: { index: false, follow: false } };
  }

  const title = `${p.display_name}${p.city ? " — " + p.city : ""}`;
  const description =
    p.details?.main_heading?.trim() ||
    `${p.display_name} — companion listing${
      p.city ? " in " + p.city : ""
    } on Amicora. Adults only (18+).`;
  const canonical = `/companions/${params.id}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      title: `${title} · Amicora`,
      description,
      url: `${SITE_URL}${canonical}`,
      // Use the static branded share image rather than a signed MinIO URL,
      // which would expire and break social previews.
      images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Amicora" }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · Amicora`,
      description,
      images: ["/og.jpg"],
    },
  };
}

export default function Page({ params }: { params: { id: string } }) {
  return <CompanionView id={params.id} />;
}
