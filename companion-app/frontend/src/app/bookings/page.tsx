"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi, useAction } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/guard";
import { Alert, Badge, Button, Card, Empty, Loading, Stars, Textarea } from "@/components/ui";
import { CATEGORY_LABELS, type Booking, type BookingStatus } from "@/lib/types";

const STATUS_TONE: Record<BookingStatus, "neutral" | "ok" | "warn" | "block" | "accent"> = {
  requested: "warn",
  accepted: "ok",
  declined: "block",
  canceled: "neutral",
  completed: "accent",
  no_show: "block",
};

// Which transitions each side may attempt; the server is authoritative.
function actionsFor(role: string, b: Booking): BookingStatus[] {
  const provider = role === "companion" || role === "agent";
  if (b.status === "requested") return provider ? ["accepted", "declined"] : ["canceled"];
  if (b.status === "accepted")
    return provider ? ["completed", "no_show", "canceled"] : ["canceled"];
  return [];
}

const ACTION_LABEL: Record<BookingStatus, string> = {
  requested: "Reopen",
  accepted: "Accept",
  declined: "Decline",
  canceled: "Cancel",
  completed: "Mark completed",
  no_show: "No-show",
};

export default function BookingsPage() {
  return (
    <RequireAuth>
      <BookingsInner />
    </RequireAuth>
  );
}

function BookingsInner() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi(() => api.myBookings(), []);
  const { loading: acting, error: actError, run } = useAction();

  function act(b: Booking, status: BookingStatus) {
    run(async () => {
      await api.setBookingStatus(b.id, status);
      reload();
    });
  }

  return (
    <div className="py-6">
      <h1 className="text-gradient w-fit font-display text-3xl font-semibold tracking-tight">Bookings</h1>
      <p className="mt-2 text-sm text-muted">
        Requests you&apos;ve made or received. The companionship fee is settled directly, off-platform.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {loading && <Loading />}
        {error && <Alert>{error}</Alert>}
        {actError && <Alert>{actError}</Alert>}
        {data && data.length === 0 && <Empty>No bookings yet.</Empty>}
        {data?.map((b) => {
          const actions = user ? actionsFor(user.role, b) : [];
          const canReview = user?.role === "client" && b.status === "completed";
          return (
            <Card key={b.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{CATEGORY_LABELS[b.category]}</span>
                    <Badge tone={STATUS_TONE[b.status]}>{b.status.replace("_", " ")}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {new Date(b.requested_start).toLocaleString()}
                    {b.location_note ? ` · ${b.location_note}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {actions.map((s) => (
                    <Button
                      key={s}
                      variant={s === "declined" || s === "canceled" || s === "no_show" ? "secondary" : "primary"}
                      onClick={() => act(b, s)}
                      loading={acting}
                    >
                      {ACTION_LABEL[s]}
                    </Button>
                  ))}
                </div>
              </div>
              {canReview && <ReviewBox bookingId={b.id} />}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function ReviewBox({ bookingId }: { bookingId: string }) {
  const { loading, error, run, setError } = useAction();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState<number | null>(null);

  if (done !== null) {
    return (
      <div className="flex items-center gap-2 border-t border-hair pt-3 text-sm text-muted">
        <span>Your review:</span>
        <Stars value={done} />
        <span className="text-faint">— thanks for the feedback.</span>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="border-t border-hair pt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-accent-ink hover:underline"
        >
          Leave a review
        </button>
      </div>
    );
  }

  function submit() {
    if (rating < 1) return setError("Pick a star rating.");
    run(async () => {
      await api.createReview(bookingId, { rating, comment: comment.trim() || undefined });
      setDone(rating);
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-hair pt-3">
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => setRating(n)}
            className={`text-2xl leading-none ${
              n <= (hover || rating) ? "text-accent" : "text-hair-strong"
            }`}
          >
            ★
          </button>
        ))}
      </div>
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Share how it went (optional)."
        className="min-h-16"
      />
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button onClick={submit} loading={loading}>
          Submit review
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
