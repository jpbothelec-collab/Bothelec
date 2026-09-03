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
  const { data, error, loading, reload } = useApi(() => api.myProfile(), []);
  // A 404 means "no profile yet" — offer creation instead of an error.
  const notFound = error && /not found|404/i.test(error);

  if (loading) return <Loading />;
  if (data) return <ProfileEditor profile={data} onSaved={reload} />;
  if (notFound) return <CreateProfile onCreated={reload} />;
  return <Alert>{error}</Alert>;
}

function CreateProfile({ onCreated }: { onCreated: () => void }) {
  const { loading, error, run } = useAction();
  const [name, setName] = useState("");
  return (
    <div className="mx-auto max-w-lg py-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Create your profile</h1>
      <Card className="mt-6 p-6">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api.createProfile({ display_name: name });
              onCreated();
            });
          }}
        >
          <Field label="Display name" hint="This is how you'll appear to clients.">
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
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
  const [feeRands, setFeeRands] = useState(String(profile.monthly_listing_fee_zar));
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
      const zar = parseFloat(feeRands || "0");
      if (zar !== profile.monthly_listing_fee_zar) {
        await api.setListingFee(profile.id, zar);
      }
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
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">My profile</h1>
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
            <Field label="Monthly listing fee (ZAR)" hint="What you pay Amicora to keep this profile live.">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={feeRands}
                onChange={(e) => setFeeRands(e.target.value)}
              />
            </Field>
            {error && <Alert>{error}</Alert>}
            {ok && <Alert tone="ok">{ok}</Alert>}
            <Button type="submit" loading={loading}>
              Save changes
            </Button>
          </form>
        </Card>

        <div className="flex flex-col gap-6">
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
        </div>
      </div>
    </div>
  );
}
