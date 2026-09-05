"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi, useAction } from "@/lib/useApi";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading } from "@/components/ui";
import type { PendingVerificationDocument } from "@/lib/types";

export default function VerificationQueuePage() {
  const { data, error, loading, reload } = useApi(() => api.verificationQueue(), []);

  return (
    <div>
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-ink">Verification queue</h2>
        {data && <Badge>{data.length} pending</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted">
        Approve only after confirming the document and a date of birth showing age 21 or over. The
        server rejects any approval under 21 regardless.
      </p>

      <div className="mt-5 flex flex-col gap-3">
        {loading && <Loading />}
        {error && <Alert>{error}</Alert>}
        {data && data.length === 0 && <Empty>Nothing awaiting review.</Empty>}
        {data?.map((doc) => (
          <ReviewRow key={doc.id} doc={doc} onDone={reload} />
        ))}
      </div>
    </div>
  );
}

function ReviewRow({ doc, onDone }: { doc: PendingVerificationDocument; onDone: () => void }) {
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const { loading, error, run, setError } = useAction();
  const [dob, setDob] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");

  function approve() {
    if (!dob) return setError("Enter the date of birth from the document.");
    run(async () => {
      await api.reviewDocument(doc.id, {
        approve: true,
        extracted_dob: dob,
        extracted_full_name: name || undefined,
      });
      onDone();
    });
  }
  function reject() {
    if (!reason) return setError("Give a reason for rejection.");
    run(async () => {
      await api.reviewDocument(doc.id, { approve: false, rejection_reason: reason });
      onDone();
    });
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">
            {doc.document_type.toUpperCase().replace("_", " ")}
          </p>
          <p className="font-mono text-xs text-muted">user {doc.user_id}</p>
        </div>
        <span className="text-xs text-faint">{new Date(doc.created_at).toLocaleString()}</span>
        {mode === "idle" && (
          <div className="flex gap-2">
            <Button onClick={() => setMode("approve")}>Approve</Button>
            <Button variant="secondary" onClick={() => setMode("reject")}>
              Reject
            </Button>
          </div>
        )}
      </div>

      {doc.image_url ? (
        <div className="mt-3">
          {/\.pdf(\?|$)/i.test(doc.image_url) ? (
            <a
              href={doc.image_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-accent-ink hover:underline"
            >
              Open ID document (PDF) ↗
            </a>
          ) : (
            <a href={doc.image_url} target="_blank" rel="noopener noreferrer" title="Open full size">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={doc.image_url}
                alt="ID document"
                className="max-h-96 w-auto rounded-lg border border-hair"
              />
            </a>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-faint">
          Document image unavailable (it may have been purged after the retention window).
        </p>
      )}

      {mode === "approve" && (
        <div className="mt-4 flex flex-col gap-3 border-t border-hair pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date of birth (from document)">
              <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </Field>
            <Field label="Full name" hint="Optional">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          {error && <Alert>{error}</Alert>}
          <div className="flex gap-2">
            <Button onClick={approve} loading={loading}>
              Confirm approval
            </Button>
            <Button variant="ghost" onClick={() => setMode("idle")}>
              Back
            </Button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="mt-4 flex flex-col gap-3 border-t border-hair pt-4">
          <Field label="Reason">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Illegible document, name mismatch…" />
          </Field>
          {error && <Alert>{error}</Alert>}
          <div className="flex gap-2">
            <Button variant="danger" onClick={reject} loading={loading}>
              Confirm rejection
            </Button>
            <Button variant="ghost" onClick={() => setMode("idle")}>
              Back
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
