"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useApi, useAction } from "@/lib/useApi";
import { Alert, Badge, Button, Card, Empty, Input, Loading } from "@/components/ui";
import type { AdminProfileRow } from "@/lib/types";

export default function AdminProfilesPage() {
  const { data, error, loading, reload } = useApi(() => api.adminProfiles(), []);

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink">Profile activation</h2>
      <p className="mt-1 text-sm text-muted">
        Manually activate a profile without payment — this marks the owner verified and grants a
        listing subscription, so they can publish. Photos still pass moderation, and the owner still
        clicks Publish. Needs the <span className="font-medium text-ink">manager</span> tier or above.
      </p>

      {loading && <Loading />}
      {error && <Alert>{error}</Alert>}
      {data && data.length === 0 && (
        <Empty>No profiles yet. They&rsquo;ll appear here once companions or agencies create one.</Empty>
      )}

      {data && data.length > 0 && (
        <div className="mt-5 flex flex-col gap-2">
          {data.map((p) => (
            <ProfileRow key={p.id} p={p} onChanged={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileRow({ p, onChanged }: { p: AdminProfileRow; onChanged: () => void }) {
  const { loading, error, run } = useAction();
  const [note, setNote] = useState<string | null>(null);
  const [fee, setFee] = useState(String(p.monthly_listing_fee_zar));

  const verified = p.owner_verification_status === "verified";

  function saveFee() {
    setNote(null);
    run(async () => {
      await api.setListingFee(p.id, parseFloat(fee || "0"));
      setNote(`Listing fee set to R${parseFloat(fee || "0").toFixed(2)}.`);
      onChanged();
    });
  }

  function activate() {
    setNote(null);
    run(async () => {
      const r = await api.adminActivateProfile(p.id);
      setNote(r.detail);
      onChanged();
    });
  }
  function deactivate() {
    setNote(null);
    run(async () => {
      const r = await api.adminDeactivateProfile(p.id);
      setNote(r.detail);
      onChanged();
    });
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/companions/${p.id}`} className="font-medium text-accent-ink hover:underline">
              {p.display_name}
            </Link>
            <Badge tone={p.is_published ? "ok" : "neutral"}>
              {p.is_published ? "Published" : "Unpublished"}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {p.owner_email} · {p.owner_role}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={verified ? "ok" : "warn"}>
              {verified ? "Verified" : p.owner_verification_status}
            </Badge>
            <Badge tone={p.listing_active ? "ok" : "warn"}>
              {p.listing_active ? (p.listing_is_manual ? "Listing: manual" : "Listing: paid") : "No listing"}
            </Badge>
            <Badge tone={p.approved_photo_count > 0 ? "ok" : "warn"}>
              {p.approved_photo_count} photo{p.approved_photo_count === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={activate} loading={loading} disabled={verified && p.listing_active}>
            Activate
          </Button>
          {p.listing_is_manual && (
            <Button variant="secondary" onClick={deactivate} loading={loading}>
              Deactivate
            </Button>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hair pt-3">
        <span className="text-xs font-medium text-muted">Listing fee (ZAR)</span>
        <Input
          type="number"
          min={0}
          step="0.01"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          className="w-32"
        />
        <Button variant="secondary" onClick={saveFee} loading={loading}>
          Save fee
        </Button>
        <span className="text-xs text-faint">Amicora sets this — the lister can&rsquo;t edit it.</span>
      </div>
      {p.approved_photo_count === 0 && (verified && p.listing_active) && (
        <p className="mt-2 text-xs text-faint">
          Activated — but at least one approved photo is still needed before the owner can publish
          (approve one under Moderation).
        </p>
      )}
      {note && <p className="mt-2 text-xs text-ok">{note}</p>}
      {error && <div className="mt-2"><Alert>{error}</Alert></div>}
    </Card>
  );
}
