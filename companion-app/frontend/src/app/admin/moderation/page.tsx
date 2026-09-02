"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi, useAction } from "@/lib/useApi";
import { Alert, Badge, Button, Card, Empty, Input, Loading } from "@/components/ui";
import type { FlaggedMessage, ReportResponse } from "@/lib/types";

export default function ModerationPage() {
  return (
    <div className="flex flex-col gap-10">
      <FlaggedMessages />
      <Reports />
    </div>
  );
}

function FlaggedMessages() {
  const { data, error, loading, reload } = useApi(() => api.flaggedMessages(), []);
  const { loading: acting, error: actErr, run } = useAction();
  const [suspend, setSuspend] = useState<Record<string, boolean>>({});

  function review(m: FlaggedMessage, outcome: "dismissed" | "confirmed_violation") {
    run(async () => {
      await api.reviewMessage(m.id, {
        outcome,
        suspend_sender: outcome === "confirmed_violation" ? !!suspend[m.id] : undefined,
      });
      reload();
    });
  }

  return (
    <section>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-ink">Flagged messages</h2>
        {data && <Badge>{data.length}</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted">Messages the solicitation filter flagged for review.</p>

      <div className="mt-4 flex flex-col gap-3">
        {loading && <Loading />}
        {(error || actErr) && <Alert>{error || actErr}</Alert>}
        {data && data.length === 0 && <Empty>No messages awaiting review.</Empty>}
        {data?.map((m) => (
          <Card key={m.id} className="p-4">
            <div className="flex items-center gap-2">
              {m.flagged_reason && <Badge tone="warn">{m.flagged_reason}</Badge>}
              <span className="font-mono text-xs text-muted">from {m.sender_id.slice(0, 8)}…</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm text-ink">
              {m.body}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => review(m, "dismissed")} loading={acting}>
                Dismiss (false positive)
              </Button>
              <Button variant="danger" onClick={() => review(m, "confirmed_violation")} loading={acting}>
                Confirm violation
              </Button>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={!!suspend[m.id]}
                  onChange={(e) => setSuspend((s) => ({ ...s, [m.id]: e.target.checked }))}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                also suspend sender
              </label>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Reports() {
  const { data, error, loading, reload } = useApi(() => api.pendingReports(), []);
  const { loading: acting, error: actErr, run } = useAction();
  const [note, setNote] = useState<Record<string, string>>({});

  function resolve(r: ReportResponse, status: "resolved" | "dismissed") {
    run(async () => {
      await api.resolveReport(r.id, { status, resolution_note: note[r.id] || undefined });
      reload();
    });
  }

  return (
    <section>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-ink">User reports</h2>
        {data && <Badge>{data.length}</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted">Reports submitted by users, awaiting a decision.</p>

      <div className="mt-4 flex flex-col gap-3">
        {loading && <Loading />}
        {(error || actErr) && <Alert>{error || actErr}</Alert>}
        {data && data.length === 0 && <Empty>No open reports.</Empty>}
        {data?.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-center gap-2">
              <Badge tone="warn">{r.reason}</Badge>
              <span className="font-mono text-xs text-muted">on {r.reported_user_id.slice(0, 8)}…</span>
            </div>
            {r.details && <p className="mt-2 text-sm text-ink">{r.details}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                value={note[r.id] || ""}
                onChange={(e) => setNote((n) => ({ ...n, [r.id]: e.target.value }))}
                placeholder="Resolution note (optional)"
                className="w-56"
              />
              <Button onClick={() => resolve(r, "resolved")} loading={acting}>
                Resolve
              </Button>
              <Button variant="secondary" onClick={() => resolve(r, "dismissed")} loading={acting}>
                Dismiss
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
