"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/guard";
import { IdVerification } from "@/components/id-verification";
import { PremiumSubscription } from "@/components/premium";
import { Badge, Card } from "@/components/ui";

const ROLE_LABEL: Record<string, string> = {
  client: "Client",
  companion: "Companion",
  agent: "Agent",
  admin: "Administrator",
};

export default function AccountPage() {
  return (
    <RequireAuth>
      <AccountInner />
    </RequireAuth>
  );
}

function AccountInner() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="py-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Account</h1>

      <Card className="mt-6 flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted">Signed in as</p>
          <p className="font-mono text-sm text-ink">{user.id}</p>
        </div>
        <Badge tone="accent">{ROLE_LABEL[user.role] ?? user.role}</Badge>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Only listers verify their identity/age (21+). Clients simply
            self-attest 18+ in the browser age gate — no ID required. */}
        {(user.role === "companion" || user.role === "agent") && <IdVerification />}
        {user.role === "client" && (
          <>
            <Card className="p-5">
              <h2 className="font-medium text-ink">Age</h2>
              <p className="mt-1 text-sm text-muted">
                You confirmed you&apos;re 18 or older to browse. Clients don&apos;t submit ID — only
                listed companions are identity-verified.
              </p>
            </Card>
            <PremiumSubscription />
          </>
        )}
        {(user.role === "companion" || user.role === "agent") && (
          <Card className="p-5">
            <h2 className="font-medium text-ink">Your listing</h2>
            <p className="mt-1 text-sm text-muted">
              Manage your profile, photos, listing fee and publication.
            </p>
            <Link
              href="/profile"
              className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Manage profile
            </Link>
          </Card>
        )}
      </div>
    </div>
  );
}
