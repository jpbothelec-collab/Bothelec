"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/guard";
import { Alert, Card, Empty, Loading } from "@/components/ui";
import type { Conversation } from "@/lib/types";

export default function MessagesPage() {
  return (
    <RequireAuth roles={["client", "companion", "agent"]}>
      <MessagesInner />
    </RequireAuth>
  );
}

function MessagesInner() {
  const { user } = useAuth();
  const { data, error, loading } = useApi(() => api.myConversations(), []);

  function counterpart(c: Conversation): string {
    // The other participant relative to the signed-in user.
    const otherId = user?.id === c.client_id ? c.companion_id : c.client_id;
    const role = user?.id === c.client_id ? "Companion" : "Client";
    return `${role} · ${otherId.slice(0, 8)}…`;
  }

  return (
    <div className="mx-auto max-w-2xl py-6">
      <h1 className="text-gradient w-fit font-display text-3xl font-semibold tracking-tight">Messages</h1>
      <p className="mt-2 text-sm text-muted">
        Conversations with companions and clients. Keep arrangements respectful — messages may be
        reviewed.
      </p>

      <div className="mt-6 flex flex-col gap-2">
        {loading && <Loading />}
        {error && <Alert>{error}</Alert>}
        {data && data.length === 0 && (
          <Empty>No conversations yet. Start one from a companion&apos;s profile.</Empty>
        )}
        {data?.map((c) => (
          <Link key={c.id} href={`/messages/${c.id}`}>
            <Card className="flex items-center justify-between p-4 transition-colors hover:bg-surface-2">
              <div>
                <p className="font-medium text-ink">{counterpart(c)}</p>
                <p className="text-xs text-faint">
                  Started {new Date(c.created_at).toLocaleDateString()}
                  {c.booking_id ? " · linked to a booking" : ""}
                </p>
              </div>
              <span className="text-accent-ink">→</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
