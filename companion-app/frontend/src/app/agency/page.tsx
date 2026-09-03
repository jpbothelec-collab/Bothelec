"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useApi, useAction } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/guard";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading } from "@/components/ui";
import type { Agency } from "@/lib/types";

export default function AgencyPage() {
  return (
    <RequireAuth roles={["agent"]}>
      <AgencyInner />
    </RequireAuth>
  );
}

function AgencyInner() {
  const { data, error, loading, reload } = useApi(() => api.myAgency(), []);
  if (loading) return <Loading />;
  if (error || !data) return <Alert>{error || "Couldn't load your agency."}</Alert>;
  return <AgencyView agency={data} onChanged={reload} />;
}

function AgencyBranding({ agency, onChanged }: { agency: Agency; onChanged: () => void }) {
  const { loading, error, run } = useAction();

  function upload(kind: "background" | "price", file?: File) {
    if (!file) return;
    run(async () => {
      if (kind === "background") await api.uploadAgencyBackground(file);
      else await api.uploadAgencyPriceList(file);
      onChanged();
    });
  }
  function remove(kind: "background" | "price") {
    run(async () => {
      if (kind === "background") await api.deleteAgencyBackground();
      else await api.deleteAgencyPriceList();
      onChanged();
    });
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="font-medium text-ink">Page background</h2>
        <p className="mt-1 text-sm text-muted">Shown behind your public agency page (jpg/png/webp).</p>
        {agency.background_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={agency.background_url}
            alt="Agency background"
            className="mt-3 h-32 w-full rounded-lg object-cover"
          />
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            {agency.background_url ? "Replace" : "Upload background"}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => upload("background", e.target.files?.[0])}
              className="hidden"
              disabled={loading}
            />
          </label>
          {agency.background_url && (
            <Button variant="secondary" onClick={() => remove("background")} loading={loading}>
              Remove
            </Button>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-medium text-ink">Price list</h2>
        <p className="mt-1 text-sm text-muted">
          A PDF or image clients can view on your page. Rates are settled off-platform.
        </p>
        {agency.price_list_url && (
          <a
            href={agency.price_list_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-sm font-medium text-accent-ink hover:underline"
          >
            View current price list ↗
          </a>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            {agency.price_list_url ? "Replace" : "Upload price list"}
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => upload("price", e.target.files?.[0])}
              className="hidden"
              disabled={loading}
            />
          </label>
          {agency.price_list_url && (
            <Button variant="secondary" onClick={() => remove("price")} loading={loading}>
              Remove
            </Button>
          )}
        </div>
      </Card>

      {error && (
        <div className="lg:col-span-2">
          <Alert>{error}</Alert>
        </div>
      )}
    </div>
  );
}

function AgencyView({ agency, onChanged }: { agency: Agency; onChanged: () => void }) {
  const { user } = useAuth();
  const [name, setName] = useState(agency.agency_name ?? "");
  const [copied, setCopied] = useState(false);
  const { loading, error, run } = useAction();

  useEffect(() => setCopied(false), [agency.agency_code]);

  function save() {
    run(async () => {
      await api.updateAgency(name.trim());
      onChanged();
    });
  }

  function copy() {
    navigator.clipboard?.writeText(agency.agency_code).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  }

  return (
    <div className="py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Agency</h1>
        {user && (
          <Link
            href={`/agencies/${user.id}`}
            className="rounded-lg border border-hair px-3 py-1.5 text-sm font-medium text-accent-ink hover:bg-surface-2"
          >
            View public page →
          </Link>
        )}
      </div>
      <p className="mt-2 text-sm text-muted">
        Set your agency name and share your code with companions so they can link their profiles to
        you.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <Field label="Agency name">
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your agency" />
              <Button onClick={save} loading={loading} disabled={!name.trim()}>
                Save
              </Button>
            </div>
          </Field>
          {error && (
            <div className="mt-3">
              <Alert>{error}</Alert>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-medium text-ink">Share code</h2>
          <p className="mt-1 text-sm text-muted">
            Companions enter this on their profile (or at signup) to join your agency.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="rounded-lg bg-surface-2 px-3 py-2 font-mono text-lg tracking-wider text-ink">
              {agency.agency_code}
            </code>
            <Button variant="secondary" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </Card>
      </div>

      <AgencyBranding agency={agency} onChanged={onChanged} />

      <div className="mt-8">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-ink">Roster</h2>
          <Badge>{agency.roster.length}</Badge>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {agency.roster.length === 0 && (
            <Empty>No companions linked yet. Share your code to grow your roster.</Empty>
          )}
          {agency.roster.map((p) => (
            <Card key={p.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{p.display_name}</span>
                  {p.is_available && <Badge tone="ok">Available now</Badge>}
                  <Badge tone={p.is_published ? "accent" : "neutral"}>
                    {p.is_published ? "Published" : "Unpublished"}
                  </Badge>
                </div>
                {p.city && <p className="mt-0.5 text-xs text-muted">{p.city}</p>}
              </div>
              <Link href={`/companions/${p.id}`} className="text-sm font-medium text-accent-ink">
                View →
              </Link>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
