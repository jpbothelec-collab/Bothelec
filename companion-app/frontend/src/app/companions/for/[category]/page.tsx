import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ProfileSearch } from "@/lib/types";
import { ProfileCard } from "@/components/profile-card";
import { Empty } from "@/components/ui";
import { SITE_URL, serverFetch } from "@/lib/seo";
import { CITIES, CATEGORIES, categoryBySlug } from "@/lib/landing";

// Pre-render a page for every category at build time; anything else 404s.
export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.slug }));
}

// Rebuild hourly so newly published profiles surface on the hub pages.
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: { category: string };
}): Promise<Metadata> {
  const cat = categoryBySlug(params.category);
  if (!cat) return { title: "Companions", robots: { index: false, follow: false } };

  const title = cat.label;
  const description = `${cat.blurb} Browse verified ${cat.label.toLowerCase()} on Amicora across South Africa. Adults only (18+).`;
  const canonical = `/companions/for/${cat.slug}`;

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

export default async function CategoryPage({
  params,
}: {
  params: { category: string };
}) {
  const cat = categoryBySlug(params.category);
  if (!cat) notFound();

  const data = await serverFetch<ProfileSearch>(
    `/profiles?category=${encodeURIComponent(cat.key)}&page_size=24`,
  );
  const items = data?.items ?? [];

  return (
    <div className="py-6">
      <nav className="text-xs text-muted">
        <Link href="/browse" className="hover:text-accent">
          Browse
        </Link>
        <span className="mx-1.5">/</span>
        <span>{cat.label}</span>
      </nav>

      <h1 className="text-gradient mt-2 w-fit font-display text-3xl font-semibold tracking-tight">
        {cat.label}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        {cat.blurb} Every profile is an introduction only — Amicora is never party to any
        arrangement between adults.
      </p>

      <div className="mt-8">
        {items.length === 0 ? (
          <Empty>
            No published {cat.label.toLowerCase()} just yet. Check{" "}
            <Link href="/browse" className="text-accent underline">
              all listings
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
        <h2 className="text-sm font-semibold text-ink">Companions by city</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {CITIES.map((c) => (
            <Link
              key={c.slug}
              href={`/companions/in/${c.slug}`}
              className="rounded-full border border-hair px-3 py-1 text-sm text-muted hover:border-accent hover:text-accent"
            >
              {c.name}
            </Link>
          ))}
        </div>

        <h2 className="mt-6 text-sm font-semibold text-ink">Other categories</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {CATEGORIES.filter((c) => c.slug !== cat.slug).map((c) => (
            <Link
              key={c.slug}
              href={`/companions/for/${c.slug}`}
              className="rounded-full border border-hair px-3 py-1 text-sm text-muted hover:border-accent hover:text-accent"
            >
              {c.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
