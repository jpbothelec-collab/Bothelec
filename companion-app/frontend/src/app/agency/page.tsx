"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useApi, useAction } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/guard";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, Textarea } from "@/components/ui";
import {
  CATEGORY_LABELS,
  type Agency,
  type CompanionProfile,
  type CompanionshipCategory,
} from "@/lib/types";

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
        <h1 className="text-gradient w-fit font-display text-3xl font-semibold tracking-tight">Agency</h1>
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
        <p className="mt-1 text-sm text-muted">
          Edit a companion&rsquo;s details and toggle their availability directly from here.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {agency.roster.length === 0 && (
            <Empty>No companions linked yet. Share your code to grow your roster.</Empty>
          )}
          {agency.roster.map((p) => (
            <RosterRow key={p.id} profile={p} onChanged={onChanged} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RosterRow({ profile, onChanged }: { profile: CompanionProfile; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const { loading: availLoading, run: runAvail } = useAction();

  function toggleAvailability() {
    runAvail(async () => {
      await api.setProfileAvailability(profile.id, !profile.is_available);
      onChanged();
    });
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{profile.display_name}</span>
            {profile.is_available && <Badge tone="ok">Available now</Badge>}
            <Badge tone={profile.is_published ? "accent" : "neutral"}>
              {profile.is_published ? "Published" : "Unpublished"}
            </Badge>
          </div>
          {profile.city && <p className="mt-0.5 text-xs text-muted">{profile.city}</p>}
        </div>
        <Button
          variant="secondary"
          onClick={toggleAvailability}
          loading={availLoading}
          className="whitespace-nowrap"
        >
          {profile.is_available ? "Set unavailable" : "Set available now"}
        </Button>
        <Button variant="secondary" onClick={() => setEditing((v) => !v)}>
          {editing ? "Close" : "Edit"}
        </Button>
        <Link href={`/companions/${profile.id}`} className="text-sm font-medium text-accent-ink">
          View →
        </Link>
      </div>
      {editing && (
        <>
          <RosterEditForm profile={profile} onSaved={onChanged} />
          <RosterPhotos profile={profile} onChanged={onChanged} />
        </>
      )}
    </Card>
  );
}

function RosterPhotos({ profile, onChanged }: { profile: CompanionProfile; onChanged: () => void }) {
  const { loading, error, run } = useAction();
  const [busyId, setBusyId] = useState<string | null>(null);

  function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    run(async () => {
      await api.uploadManagedPortfolioImage(profile.id, file);
      onChanged();
    });
  }

  function remove(id: string) {
    setBusyId(id);
    run(async () => {
      await api.deleteManagedPortfolioImage(profile.id, id);
      onChanged();
    }).finally(() => setBusyId(null));
  }

  const statusTone = (s: string) =>
    s === "approved" ? "ok" : s === "rejected" ? "block" : "warn";

  return (
    <div className="mt-4 border-t border-hair pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-ink">Photos</h3>
          <p className="mt-0.5 text-xs text-muted">
            Up to 10. New photos are reviewed before they appear publicly.
          </p>
        </div>
        <label className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          {loading ? "Uploading…" : "Add photo"}
          <input type="file" accept="image/*" onChange={upload} className="hidden" disabled={loading} />
        </label>
      </div>

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {profile.media.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-hair-strong px-4 py-6 text-center text-sm text-muted">
          No photos yet.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
          {profile.media.map((m) => (
            <div key={m.id} className="group relative overflow-hidden rounded-lg bg-surface-2">
              <div className="aspect-square">
                {m.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center font-display text-2xl text-hair-strong">
                    {profile.display_name.slice(0, 1)}
                  </div>
                )}
              </div>
              <div className="absolute left-1.5 top-1.5">
                <Badge tone={statusTone(m.moderation_status)}>{m.moderation_status}</Badge>
              </div>
              <button
                type="button"
                onClick={() => remove(m.id)}
                disabled={busyId === m.id}
                className="absolute right-1.5 top-1.5 rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RosterEditForm({ profile, onSaved }: { profile: CompanionProfile; onSaved: () => void }) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [city, setCity] = useState(profile.city ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [rate, setRate] = useState(profile.indicative_rate_note ?? "");
  const [contact, setContact] = useState(profile.contact_details ?? "");
  const [cats, setCats] = useState<CompanionshipCategory[]>(profile.categories);
  const { loading, error, run } = useAction();

  function toggleCat(c: CompanionshipCategory) {
    setCats((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      await api.manageProfile(profile.id, {
        display_name: displayName,
        bio,
        city,
        indicative_rate_note: rate,
        contact_details: contact,
        categories: cats,
      });
      onSaved();
    });
  }

  return (
    <form className="mt-4 flex flex-col gap-4 border-t border-hair pt-4" onSubmit={save}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name">
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </Field>
        <Field label="City">
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cape Town" />
        </Field>
      </div>
      <Field label="Bio">
        <Textarea value={bio} onChange={(e) => setBio(e.target.value)} />
      </Field>
      <Field label="Indicative rate note" hint="Informational only — settled off-platform.">
        <Input
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="e.g. From R1500 / evening"
        />
      </Field>
      <Field
        label="Contact details"
        hint="How clients can reach this companion (e.g. WhatsApp, email). Shown on the public profile."
      >
        <Textarea
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="WhatsApp +27 …  ·  name@example.com"
          className="min-h-16"
        />
      </Field>
      <div>
        <span className="text-sm font-medium text-ink">Categories</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(CATEGORY_LABELS) as CompanionshipCategory[]).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => toggleCat(c)}
              className={
                "rounded-full border px-3 py-1 text-sm " +
                (cats.includes(c)
                  ? "border-transparent bg-accent-soft text-accent-ink"
                  : "border-hair text-muted hover:bg-surface-2")
              }
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" loading={loading}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
