"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApi, useAction } from "@/lib/useApi";
import { RequireAuth } from "@/components/guard";
import { Alert, Badge, Button, Card, Field, Input, Loading, Textarea } from "@/components/ui";
import { CATEGORY_LABELS, type CompanionProfile, type CompanionshipCategory } from "@/lib/types";

export default function ProfilePage() {
  return (
    <RequireAuth roles={["companion", "agent"]}>
      <ProfileInner />
    </RequireAuth>
  );
}

function ProfileInner() {
  const { data, error, status, loading, reload } = useApi(() => api.myProfile(), []);
  // A 404 means "no profile yet" — offer creation instead of an error.
  const notFound = status === 404;

  if (loading) return <Loading />;
  if (data) return <ProfileEditor profile={data} onSaved={reload} />;
  if (notFound) return <CreateProfile onCreated={reload} />;
  return <Alert>{error}</Alert>;
}

function CreateProfile({ onCreated }: { onCreated: () => void }) {
  const { loading, error, run } = useAction();
  const [name, setName] = useState("");
  const [agencyCode, setAgencyCode] = useState("");
  return (
    <div className="mx-auto max-w-lg py-6">
      <h1 className="text-gradient w-fit font-display text-3xl font-semibold tracking-tight">
        Create your profile
      </h1>
      <p className="mt-2 text-sm text-muted">
        List as an individual, or join an agency by entering its code below.
      </p>
      <Card className="mt-6 p-6">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api.createProfile({
                display_name: name,
                agency_code: agencyCode.trim() || undefined,
              });
              onCreated();
            });
          }}
        >
          <Field label="Display name" hint="This is how you'll appear to clients.">
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Agency code" hint="Optional — only if you're joining an agency.">
            <Input
              value={agencyCode}
              onChange={(e) => setAgencyCode(e.target.value.toUpperCase())}
              placeholder="AG-XXXXXX"
              className="font-mono"
            />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={loading} disabled={!name}>
            Create profile
          </Button>
        </form>
      </Card>
    </div>
  );
}

function ProfileEditor({ profile, onSaved }: { profile: CompanionProfile; onSaved: () => void }) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [rate, setRate] = useState(profile.indicative_rate_note ?? "");
  const [contact, setContact] = useState(profile.contact_details ?? "");
  const [cats, setCats] = useState<CompanionshipCategory[]>(profile.categories);
  const { loading, error, run } = useAction();
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => setOk(null), [displayName, bio, city, rate, contact, cats]);

  function toggleCat(c: CompanionshipCategory) {
    setCats((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  }

  function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      await api.updateMyProfile({
        display_name: displayName,
        bio,
        city,
        indicative_rate_note: rate,
        contact_details: contact,
        categories: cats,
      });
      setOk("Profile saved.");
      onSaved();
    });
  }

  function togglePublish() {
    run(async () => {
      if (profile.is_published) await api.unpublishMyProfile();
      else await api.publishMyProfile();
      onSaved();
    });
  }

  function billing(kind: "checkout" | "cancel") {
    run(async () => {
      if (kind === "checkout") {
        const res = await api.startListingCheckout(profile.id);
        window.location.href = res.authorization_url;
      } else {
        const res = await api.cancelListing(profile.id);
        setOk(res.detail);
      }
    });
  }

  return (
    <div className="py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-gradient w-fit font-display text-3xl font-semibold tracking-tight">
          My profile
        </h1>
        <Badge tone={profile.is_published ? "ok" : "neutral"}>
          {profile.is_published ? "Published" : "Not published"}
        </Badge>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-6">
          <form className="flex flex-col gap-4" onSubmit={saveDetails}>
            <Field label="Display name">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </Field>
            <Field label="City">
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cape Town" />
            </Field>
            <Field label="Bio">
              <Textarea value={bio} onChange={(e) => setBio(e.target.value)} />
            </Field>
            <Field label="Indicative rate note" hint="Informational only — settled off-platform.">
              <Input value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. From R1500 / evening" />
            </Field>
            <Field
              label="Contact details"
              hint="Optional — how clients can reach you (e.g. WhatsApp, email). Shown on your public profile."
            >
              <Textarea
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="WhatsApp +27 …  ·  you@example.com"
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
            <div className="rounded-lg border border-hair bg-surface-2 p-3">
              <p className="text-sm font-medium text-ink">
                Monthly listing fee: R{profile.monthly_listing_fee_zar.toFixed(2)}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Set by Amicora. Contact us if you have a question about your listing fee.
              </p>
            </div>
            {error && <Alert>{error}</Alert>}
            {ok && <Alert tone="ok">{ok}</Alert>}
            <Button type="submit" loading={loading}>
              Save changes
            </Button>
          </form>
        </Card>

        <div className="flex flex-col gap-6">
          <AvailabilityCard profile={profile} onChanged={onSaved} />

          <PriceListCard profile={profile} onChanged={onSaved} />

          <Card className="p-5">
            <h2 className="font-medium text-ink">Publication</h2>
            <p className="mt-1 text-sm text-muted">
              A profile can only be published with an active listing subscription and completed
              verification.
            </p>
            <Button
              variant={profile.is_published ? "secondary" : "primary"}
              onClick={togglePublish}
              loading={loading}
              className="mt-4"
            >
              {profile.is_published ? "Unpublish" : "Publish profile"}
            </Button>
          </Card>

          <Card className="p-5">
            <h2 className="font-medium text-ink">Listing subscription</h2>
            <p className="mt-1 text-sm text-muted">Monthly, per-profile. Cancel anytime — it won&apos;t renew.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => billing("checkout")} loading={loading}>
                Set up / renew
              </Button>
              <Button variant="secondary" onClick={() => billing("cancel")} loading={loading}>
                Cancel listing
              </Button>
            </div>
          </Card>

          <AgencyCard profile={profile} onChanged={onSaved} />
        </div>
      </div>

      <PhotoManager profile={profile} onChanged={onSaved} />
    </div>
  );
}

function PriceListCard({ profile, onChanged }: { profile: CompanionProfile; onChanged: () => void }) {
  const { loading, error, run } = useAction();
  function upload(file?: File) {
    if (!file) return;
    run(async () => {
      await api.uploadProfilePriceList(file);
      onChanged();
    });
  }
  function remove() {
    run(async () => {
      await api.deleteProfilePriceList();
      onChanged();
    });
  }
  return (
    <Card className="p-5">
      <h2 className="font-medium text-ink">Price list</h2>
      <p className="mt-1 text-sm text-muted">
        Advertise your rates as a PDF or image. Indicative only — the fee is agreed and settled
        directly with the client, off-platform.
      </p>
      {profile.price_list_url && (
        <a
          href={profile.price_list_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm font-medium text-accent-ink hover:underline"
        >
          View current price list ↗
        </a>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          {profile.price_list_url ? "Replace" : "Upload price list"}
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => upload(e.target.files?.[0])}
            className="hidden"
            disabled={loading}
          />
        </label>
        {profile.price_list_url && (
          <Button variant="secondary" onClick={remove} loading={loading}>
            Remove
          </Button>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  );
}

function AvailabilityCard({ profile, onChanged }: { profile: CompanionProfile; onChanged: () => void }) {
  const { loading, run } = useAction();
  function toggle() {
    run(async () => {
      await api.setAvailability(!profile.is_available);
      onChanged();
    });
  }
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-ink">Availability</h2>
          <p className="mt-1 text-sm text-muted">
            {profile.is_available
              ? "You're marked available now — you rotate near the top of search."
              : "Turn on when you're free to be booked now."}
          </p>
        </div>
        <span
          className={
            "whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium " +
            (profile.is_available ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted")
          }
        >
          {profile.is_available ? "Available now" : "Not available"}
        </span>
      </div>
      <Button
        variant={profile.is_available ? "secondary" : "primary"}
        onClick={toggle}
        loading={loading}
        className="mt-4"
      >
        {profile.is_available ? "Set to not available" : "I'm available now"}
      </Button>
    </Card>
  );
}

function AgencyCard({ profile, onChanged }: { profile: CompanionProfile; onChanged: () => void }) {
  const { loading, error, run, setError } = useAction();
  const [code, setCode] = useState("");

  function join() {
    if (!code.trim()) return setError("Enter your agency's code.");
    run(async () => {
      await api.joinAgency(code.trim());
      onChanged();
    });
  }
  function leave() {
    run(async () => {
      await api.leaveAgency();
      onChanged();
    });
  }

  return (
    <Card className="p-5">
      <h2 className="font-medium text-ink">Agency</h2>
      {profile.agency_name ? (
        <>
          <p className="mt-1 text-sm text-muted">
            Managed by <span className="font-medium text-ink">{profile.agency_name}</span>.
          </p>
          <Button variant="secondary" onClick={leave} loading={loading} className="mt-4">
            Leave agency
          </Button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            Independent. If you work with an agency, enter their code to link your profile.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="AG-XXXXXX"
              className="font-mono"
            />
            <Button onClick={join} loading={loading}>
              Join
            </Button>
          </div>
        </>
      )}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  );
}

function PhotoManager({ profile, onChanged }: { profile: CompanionProfile; onChanged: () => void }) {
  const { loading, error, run } = useAction();
  const [busyId, setBusyId] = useState<string | null>(null);

  function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    run(async () => {
      await api.uploadPortfolioImage(file);
      onChanged();
    });
  }

  function remove(id: string) {
    setBusyId(id);
    run(async () => {
      await api.deletePortfolioImage(id);
      onChanged();
    }).finally(() => setBusyId(null));
  }

  const statusTone = (s: string) =>
    s === "approved" ? "ok" : s === "rejected" ? "block" : "warn";

  return (
    <Card className="mt-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-ink">Photos</h2>
          <p className="mt-1 text-sm text-muted">
            Up to 10. New photos are reviewed before they appear publicly. Clients see your first
            few; premium clients see all.
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
        <p className="mt-5 rounded-lg border border-dashed border-hair-strong px-4 py-8 text-center text-sm text-muted">
          No photos yet. Add one to bring your profile to life.
        </p>
      ) : (
        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
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
    </Card>
  );
}
