"use client";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { ProfileCard } from "@/components/profile-card";
import { Alert, Empty, Loading } from "@/components/ui";

export default function AgencyPublicPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data, error, loading } = useApi(() => api.publicAgency(id), [id]);

  if (loading) return <Loading />;
  if (error || !data) return <Alert>{error || "Agency not found."}</Alert>;

  return (
    <div className="py-6">
      {/* Branded hero */}
      <div className="relative overflow-hidden rounded-xl2 border border-hair">
        {data.background_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={data.background_url}
            alt=""
            className="h-48 w-full object-cover sm:h-60"
          />
        ) : (
          <div className="h-40 w-full bg-accent-soft" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white">
            {data.agency_name || "Agency"}
          </h1>
          {data.price_list_url && (
            <a
              href={data.price_list_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium text-ink hover:bg-white"
            >
              View price list ↗
            </a>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Companions</h2>
        <div className="mt-3">
          {data.roster.length === 0 ? (
            <Empty>No published companions from this agency yet.</Empty>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {data.roster.map((p) => (
                <ProfileCard key={p.id} p={p} />
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="mt-8 text-xs text-faint">
        Amicora is a listing and introduction service. The companionship fee is settled directly
        between client and companion, off-platform.
      </p>
    </div>
  );
}
