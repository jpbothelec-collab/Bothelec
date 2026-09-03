"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useApi, useAction } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { Alert, Badge, Button, Card, Field, Input, Loading, Select, Stars, Textarea } from "@/components/ui";
import { CATEGORY_LABELS, type CompanionProfile, type CompanionshipCategory } from "@/lib/types";

export default function CompanionPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data: p, error, loading } = useApi(() => api.publicProfile(id), [id]);

  if (loading) return <Loading />;
  if (error || !p) return <Alert>{error || "Profile not found."}</Alert>;

  return (
    <div className="grid gap-8 py-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col gap-6">
        <header>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
              {p.display_name}
            </h1>
            {p.city && <span className="text-sm text-muted">{p.city}</span>}
          </div>
          {p.average_rating != null && (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted">
              <Stars value={p.average_rating} />
              <span className="text-ink">{p.average_rating.toFixed(1)}</span>
              <span className="text-faint">
                ({p.review_count} review{p.review_count === 1 ? "" : "s"})
              </span>
            </div>
          )}
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

        <Gallery profile={p} />

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

        {p.contact_details && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-ink">Contact</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{p.contact_details}</p>
            <p className="mt-2 text-xs text-faint">
              Shared by {p.display_name}. Arrangements are made directly between you.
            </p>
          </Card>
        )}

        <Reviews profileId={p.id} count={p.review_count} />
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <BookingPanel profile={p} />
      </aside>
    </div>
  );
}

function Reviews({ profileId, count }: { profileId: string; count: number }) {
  const { data, loading } = useApi(() => api.profileReviews(profileId), [profileId]);
  if (count === 0 && (!data || data.length === 0)) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Reviews</h2>
      {loading && <Loading />}
      <div className="mt-3 flex flex-col gap-3">
        {data?.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-center justify-between">
              <Stars value={r.rating} />
              <span className="text-xs text-faint">
                {new Date(r.created_at).toLocaleDateString()}
              </span>
            </div>
            {r.comment && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{r.comment}</p>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}

function Gallery({ profile }: { profile: CompanionProfile }) {
  const { media, visible_image_count, total_image_count, images_locked } = profile;
  const initial = profile.display_name.slice(0, 1);
  return (
    <div className="flex flex-col gap-3">
      {visible_image_count > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {media.map((m, i) => (
            <div
              key={m.id}
              className={`flex items-center justify-center overflow-hidden rounded-xl2 bg-accent-soft text-accent-ink/50 ${
                i === 0 ? "col-span-2 aspect-[3/2]" : "aspect-square"
              }`}
            >
              {m.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.url} alt={`${profile.display_name} ${i + 1}`} className="h-full w-full object-cover" />
              ) : (
                <span className="font-display text-3xl">{initial}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex aspect-[3/2] items-center justify-center rounded-xl2 bg-accent-soft font-display text-6xl text-accent-ink/50">
          {initial}
        </div>
      )}
      {images_locked && (
        <Card className="flex items-center justify-between gap-4 p-4">
          <p className="text-sm text-muted">
            <span className="font-medium text-ink">
              {total_image_count - visible_image_count} more photo
              {total_image_count - visible_image_count > 1 ? "s" : ""}
            </span>{" "}
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

function BookingPanel({ profile }: { profile: CompanionProfile }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const { loading, error, run, setError } = useAction();
  const { loading: msgLoading, run: runMsg } = useAction();
  const [done, setDone] = useState(false);
  const [category, setCategory] = useState<CompanionshipCategory>(
    profile.categories[0] || "dinner_date",
  );
  const [start, setStart] = useState("");
  const [note, setNote] = useState("");

  if (!ready) return null;

  const name = profile.display_name;

  if (!user) {
    return (
      <Card className="p-5">
        <h2 className="font-medium text-ink">Request time with {name}</h2>
        <p className="mt-1 text-sm text-muted">Log in as a client to book or message.</p>
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
      <Card className="p-5 text-sm text-muted">Booking requests are made by client accounts.</Card>
    );
  }

  function message() {
    runMsg(async () => {
      const conv = await api.startConversation(profile.id);
      router.push(`/messages/${conv.id}`);
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!start) {
      setError("Choose a date and time.");
      return;
    }
    run(async () => {
      await api.createBooking({
        profile_id: profile.id,
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
      <Button variant="secondary" onClick={message} loading={msgLoading} className="mt-3 w-full">
        Message {name}
      </Button>

      {done ? (
        <p className="mt-4 text-sm text-muted">
          Request sent. Track it under{" "}
          <Link href="/bookings" className="font-medium text-accent-ink">
            Bookings
          </Link>
          .
        </p>
      ) : (
        <form className="mt-4 flex flex-col gap-3.5 border-t border-hair pt-4" onSubmit={submit}>
          <Field label="Occasion">
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value as CompanionshipCategory)}
            >
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
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Where you'd like to meet, and anything helpful."
            />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={loading}>
            Send booking request
          </Button>
        </form>
      )}
    </Card>
  );
}
