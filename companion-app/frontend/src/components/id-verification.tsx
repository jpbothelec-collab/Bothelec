"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi, useAction } from "@/lib/useApi";
import { Alert, Button, Card, Field, Select } from "@/components/ui";

// Frontend half of TODO #2 — shows the POPIA processing-consent notice from
// the backend and requires an explicit, separate consent tick before upload.
export function IdVerification() {
  const { data: notice } = useApi(() => api.idConsentNotice(), []);
  const { loading, error, run, setError } = useAction();
  const [docType, setDocType] = useState("sa_id");
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("Choose a document image to upload.");
    if (!consent) return setError("You must give consent before submitting your ID document.");
    run(async () => {
      await api.submitIdDocument(docType, consent, file);
      setDone(true);
    });
  }

  if (done) {
    return (
      <Card className="p-5">
        <h2 className="font-medium text-ink">Document submitted</h2>
        <p className="mt-1 text-sm text-muted">
          Your ID is queued for review. You&apos;ll be able to publish or book once your age and
          identity are confirmed (21+).
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="font-medium text-ink">Verify your identity</h2>
      <p className="mt-1 text-sm text-muted">
        Required before publishing a profile or booking. The platform minimum age is 21, confirmed
        from your document — never self-reported.
      </p>
      <form className="mt-4 flex flex-col gap-3.5" onSubmit={submit}>
        <Field label="Document type">
          <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
            <option value="sa_id">South African ID</option>
            <option value="passport">Passport</option>
          </Select>
        </Field>
        <Field label="Document image">
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent-ink"
          />
        </Field>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-surface-2 p-3.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-none accent-[var(--accent)]"
          />
          <span className="text-muted">
            {notice?.notice ??
              "I consent to processing my identity document for age and identity verification."}
            {notice && <span className="ml-1 text-faint">(v{notice.version})</span>}
          </span>
        </label>

        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={loading} disabled={!file || !consent}>
          Submit for review
        </Button>
      </form>
    </Card>
  );
}
