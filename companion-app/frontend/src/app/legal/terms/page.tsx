"use client";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Badge, Card } from "@/components/ui";

export default function TermsPage() {
  const { data } = useApi(() => api.legalVersions(), []);
  return (
    <article className="mx-auto max-w-2xl py-6">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Terms of Service</h1>
        {data && <Badge tone="accent">v{data.tos_version}</Badge>}
      </div>
      <Card className="mt-6 space-y-4 p-6 text-sm leading-relaxed text-muted">
        <p className="rounded-lg bg-warn-soft px-3.5 py-2.5 text-warn">
          Draft — pending review by a South African attorney. The authoritative document is
          distributed with your account; this page summarises its intent.
        </p>
        <p>
          <span className="font-medium text-ink">Listing service only.</span> Amicora provides a
          platform to list and discover companionship. It is never a party to the companionship fee,
          which is agreed and settled directly between client and companion.
        </p>
        <p>
          <span className="font-medium text-ink">Eligibility.</span> You must be at least 21 years
          old. Age and identity are confirmed by document review, never self-reported.
        </p>
        <p>
          <span className="font-medium text-ink">Conduct.</span> Solicitation of unlawful services is
          prohibited. Accounts may be suspended or banned for violations.
        </p>
        <p>
          <span className="font-medium text-ink">Subscriptions.</span> Listing and premium
          subscriptions renew monthly until cancelled. See the cancellation policy in your account.
        </p>
      </Card>
    </article>
  );
}
