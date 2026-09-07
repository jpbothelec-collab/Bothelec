import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ProfileSearch } from "@/lib/types";
import { ProfileCard } from "@/components/profile-card";
import { Empty } from "@/components/ui";
import { SITE_URL, serverFetch } from "@/lib/seo";
import { CITIES, CATEGORIES, cityBySlug } from "@/lib/landing";

// Pre-render a page for every known city at build time; anything else 404s.
export function generateStaticParams() {
  return CITIES.map((c) => ({ city: c.slug }));
}

// Rebuild hourly so newly published profiles surface on the hub pages.
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: { city: string };
}): Promise<Metadata> {
  const city = cityBySlug(params.city);
  if (!city) return { title: "Companions", robots: { index: false, follow: false } };

  const title = `Companions in ${city.name}`;
  const description =
    `Browse verified companion listings in ${city.name}, ${city.province}. ` +
    `Dinner dates, event plus-ones and travel companions on Amicora. Adults only (18+).`;
  const canonical = `/companions/in/${city.slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title: `${title} · Amicora`,
      description,
      url: `${SITE_URL}${canonical}`,
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

export default async function CityPage({ params }: { params: { city: string } }) {
  const city = cityBySlug(params.city);
  if (!city) notFound();

  const data = await serverFetch<ProfileSearch>(
    `/profiles?city=${encodeURIComponent(city.name)}&page_size=24`,
  );
  const items = data?.items ?? [];

  return (
    <div className="py-6">
      <nav className="text-xs text-muted">
        <Link href="/browse" className="hover:text-accent">
          Browse
        </Link>
        <span className="mx-1.5">/</span>
        <span>{city.name}</span>
      </nav>

      <h1 className="text-gradient mt-2 w-fit font-display text-3xl font-semibold tracking-tight">
        Companions in {city.name}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Verified companion listings in {city.name}, {city.province}. Every profile is an
        introduction only — Amicora is never party to any arrangement between adults.
      </p>

      <div className="mt-8">
        {items.length === 0 ? (
          <Empty>
            No published companions in {city.name} just yet. Check{" "}
            <Link href="/browse" className="text-accent underline">
              all cities
            </Link>
            .
          </Empty>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((p) => (
              <ProfileCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>

      {/* Internal links help crawlers reach every hub and spread ranking. */}
      <section className="mt-12 border-t border-hair pt-8">
        <h2 className="text-sm font-semibold text-ink">Companions by category</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/companions/for/${c.slug}`}
              className="rounded-full border border-hair px-3 py-1 text-sm text-muted hover:border-accent hover:text-accent"
            >
              {c.label}
            </Link>
          ))}
        </div>

        <h2 className="mt-6 text-sm font-semibold text-ink">Companions in other cities</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {CITIES.filter((c) => c.slug !== city.slug).map((c) => (
            <Link
              key={c.slug}
              href={`/companions/in/${c.slug}`}
              className="rounded-full border border-hair px-3 py-1 text-sm text-muted hover:border-accent hover:text-accent"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
