"use client";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Badge, Card } from "@/components/ui";

export default function PrivacyPage() {
  const { data } = useApi(() => api.legalVersions(), []);
  return (
    <article className="mx-auto max-w-2xl py-6">
      <div className="flex items-center gap-3">
        <h1 className="text-gradient w-fit font-display text-3xl font-semibold tracking-tight">Privacy Policy</h1>
        {data && <Badge tone="accent">v{data.privacy_policy_version}</Badge>}
      </div>
      <Card className="mt-6 space-y-4 p-6 text-sm leading-relaxed text-muted">
        <p className="rounded-lg bg-warn-soft px-3.5 py-2.5 text-warn">
          Draft — POPIA-structured, pending review by a South African attorney.
        </p>
        <p>
          <span className="font-medium text-ink">What we collect.</span> Account details, and — for
          verification — an identity document, treated as special personal information under POPIA
          and processed only with your explicit, separate consent.
        </p>
        <p>
          <span className="font-medium text-ink">Retention.</span> Identity documents are stored
          encrypted and the stored file is purged after review, per our retention policy.
        </p>
        <p>
          <span className="font-medium text-ink">Your rights.</span> You may request access to or
          deletion of your personal information, and withdraw consent, by contacting us.
        </p>
      </Card>
    </article>
  );
}
