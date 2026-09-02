"use client";

import { api } from "@/lib/api";
import { useApi, useAction } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/guard";
import { Alert, Badge, Button, Card, Empty, Loading } from "@/components/ui";
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
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Bookings</h1>
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
          return (
            <Card key={b.id} className="flex flex-wrap items-center gap-4 p-4">
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
            </Card>
          );
        })}
      </div>
    </div>
  );
}
