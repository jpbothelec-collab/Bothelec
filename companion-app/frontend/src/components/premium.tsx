"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi, useAction } from "@/lib/useApi";
import { Alert, Button, Card } from "@/components/ui";

// Client premium (image-unlock) subscription — checkout + self-service cancel,
// with the versioned cancellation policy from TODO #9.
export function PremiumSubscription() {
  const { data: policy } = useApi(() => api.cancellationPolicy(), []);
  const { loading, error, run } = useAction();
  const [msg, setMsg] = useState<string | null>(null);

  function upgrade() {
    run(async () => {
      const res = await api.startPremiumCheckout();
      window.location.href = res.authorization_url;
    });
  }

  function cancel() {
    run(async () => {
      const res = await api.cancelPremium();
      setMsg(res.detail);
    });
  }

  return (
    <Card className="p-5">
      <h2 className="font-medium text-ink">Premium</h2>
      <p className="mt-1 text-sm text-muted">
        Unlock every photo on a companion&apos;s profile. Fixed monthly price, charged at signup —
        no trial.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={upgrade} loading={loading}>
          Upgrade to premium
        </Button>
        <Button variant="secondary" onClick={cancel} loading={loading}>
          Cancel premium
        </Button>
      </div>

      {msg && (
        <div className="mt-3">
          <Alert tone="ok">{msg}</Alert>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}

      {policy && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-accent-ink">
            Cancellation &amp; refund policy (v{policy.version})
          </summary>
          <p className="mt-2 leading-relaxed text-muted">{policy.policy}</p>
        </details>
      )}
    </Card>
  );
}
