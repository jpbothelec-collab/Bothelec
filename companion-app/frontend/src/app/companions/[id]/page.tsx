"use client";

import { use, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useApi, useAction } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { Alert, Badge, Button, Card, Field, Input, Loading, Select, Textarea } from "@/components/ui";
import { CATEGORY_LABELS, type CompanionshipCategory } from "@/lib/types";

export default function CompanionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: p, error, loading } = useApi(() => api.publicProfile(id), [id]);

  if (loading) return <Loading />;
  if (error || !p) return <Alert>{error || "Profile not found."}</Alert>;

  return (
    <div className="grid gap-8 py-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col gap-6">
        <header>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{p.display_name}</h1>
            {p.city && <span className="text-sm text-muted">{p.city}</span>}
          </div>
          {p.categories.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.categories.map((c) => (
                <Badge key={c} tone="accent">
                  {CATEGORY_LABELS[c]}
                </Badge>
              ))}
            </div>
          )}
        </header>

        <Gallery images={p.image_urls} locked={p.images_locked} name={p.display_name} />

        {p.bio && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">About</h2>
            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{p.bio}</p>
          </section>
        )}

        {p.indicative_rate_note && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-ink">Indicative rate</h2>
            <p className="mt-1 text-sm text-muted">{p.indicative_rate_note}</p>
            <p className="mt-2 text-xs text-faint">
              The companionship fee is agreed and settled directly with {p.display_name}. Amicora is
              never party to it.
            </p>
          </Card>
        )}
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <BookingPanel profileId={p.id} name={p.display_name} categories={p.categories} />
      </aside>
    </div>
  );
}

function Gallery({ images, locked, name }: { images: string[]; locked: number; name: string }) {
  if (images.length === 0 && locked === 0) {
    return (
      <div className="flex aspect-[3/2] items-center justify-center rounded-xl2 bg-surface-2 font-display text-6xl text-hair-strong">
        {name.slice(0, 1)}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        {images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={src}
            alt={`${name} ${i + 1}`}
            className={`rounded-xl2 object-cover ${i === 0 ? "col-span-2 aspect-[3/2]" : "aspect-square"}`}
          />
        ))}
      </div>
      {locked > 0 && (
        <Card className="flex items-center justify-between gap-4 p-4">
          <p className="text-sm text-muted">
            <span className="font-medium text-ink">{locked} more photo{locked > 1 ? "s" : ""}</span>{" "}
            available with premium.
          </p>
          <Link href="/account" className="whitespace-nowrap text-sm font-medium text-accent-ink">
            Unlock →
          </Link>
        </Card>
      )}
    </div>
  );
}

function BookingPanel({
  profileId,
  name,
  categories,
}: {
  profileId: string;
  name: string;
  categories: CompanionshipCategory[];
}) {
  const { user, ready } = useAuth();
  const { loading, error, run, setError } = useAction();
  const [done, setDone] = useState(false);
  const [category, setCategory] = useState<CompanionshipCategory>(categories[0] || "dinner_date");
  const [start, setStart] = useState("");
  const [note, setNote] = useState("");

  if (!ready) return null;

  if (!user) {
    return (
      <Card className="p-5">
        <h2 className="font-medium text-ink">Request time with {name}</h2>
        <p className="mt-1 text-sm text-muted">Log in as a client to send a booking request.</p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Log in
        </Link>
      </Card>
    );
  }

  if (user.role !== "client") {
    return (
      <Card className="p-5 text-sm text-muted">
        Booking requests are made by client accounts.
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="p-5">
        <h2 className="font-medium text-ink">Request sent</h2>
        <p className="mt-1 text-sm text-muted">
          {name} will respond to your request. Track it under{" "}
          <Link href="/bookings" className="font-medium text-accent-ink">
            Bookings
          </Link>
          .
        </p>
      </Card>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!start) {
      setError("Choose a date and time.");
      return;
    }
    run(async () => {
      await api.createBooking({
        profile_id: profileId,
        category,
        requested_start: new Date(start).toISOString(),
        location_note: note || undefined,
      });
      setDone(true);
    });
  }

  return (
    <Card className="p-5">
      <h2 className="font-medium text-ink">Request time with {name}</h2>
      <form className="mt-4 flex flex-col gap-3.5" onSubmit={submit}>
        <Field label="Occasion">
          <Select value={category} onChange={(e) => setCategory(e.target.value as CompanionshipCategory)}>
            {(Object.keys(CATEGORY_LABELS) as CompanionshipCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="When">
          <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Location / notes" hint="Optional">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Where you'd like to meet, and anything helpful." />
        </Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={loading}>
          Send request
        </Button>
      </form>
    </Card>
  );
}
