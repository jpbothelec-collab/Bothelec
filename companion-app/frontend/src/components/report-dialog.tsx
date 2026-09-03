"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { Alert, Button, Field, Select, Textarea } from "@/components/ui";
import { REPORT_REASON_LABELS, type ReportReason } from "@/lib/types";

// A "Report" trigger that opens a modal to report another user to the
// moderation team (POST /reports -> admin moderation queue). Hidden if the
// viewer isn't logged in or would be reporting themselves.
export function ReportDialog({
  reportedUserId,
  reportedName,
  relatedBookingId,
  className,
}: {
  reportedUserId: string;
  reportedName?: string;
  relatedBookingId?: string;
  className?: string;
}) {
  const { user, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("harassment");
  const [details, setDetails] = useState("");
  const [done, setDone] = useState(false);
  const { loading, error, run } = useAction();

  if (!ready || !user || user.id === reportedUserId) return null;

  function submit() {
    run(async () => {
      await api.createReport({
        reported_user_id: reportedUserId,
        reason,
        details: details.trim() || undefined,
        related_booking_id: relatedBookingId,
      });
      setDone(true);
    });
  }

  function close() {
    setOpen(false);
    // reset after the dialog is dismissed
    setTimeout(() => {
      setDone(false);
      setReason("harassment");
      setDetails("");
    }, 200);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "text-xs font-medium text-muted hover:text-block"}
      >
        Report{reportedName ? ` ${reportedName}` : ""}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 p-4"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-xl2 border border-hair bg-surface p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            {done ? (
              <div>
                <h2 className="font-display text-lg font-semibold text-ink">Report received</h2>
                <p className="mt-2 text-sm text-muted">
                  Thanks — our moderation team will review this. If someone is in immediate danger,
                  please also contact local emergency services.
                </p>
                <div className="mt-5 flex justify-end">
                  <Button onClick={close}>Done</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-ink">
                    Report {reportedName || "this user"}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Reports are confidential and go to our moderation team.
                  </p>
                </div>
                <Field label="Reason">
                  <Select value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
                    {(Object.keys(REPORT_REASON_LABELS) as ReportReason[]).map((r) => (
                      <option key={r} value={r}>
                        {REPORT_REASON_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Details" hint="Optional, but helps us act faster.">
                  <Textarea
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    placeholder="What happened?"
                  />
                </Field>
                {error && <Alert>{error}</Alert>}
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={close}>
                    Cancel
                  </Button>
                  <Button variant="danger" onClick={submit} loading={loading}>
                    Submit report
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
