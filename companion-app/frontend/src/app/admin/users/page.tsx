"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useApi";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

export default function UsersPage() {
  const [userId, setUserId] = useState("");
  const { loading, error, run, setError } = useAction();
  const [result, setResult] = useState<string | null>(null);

  function act(fn: (id: string) => Promise<{ detail: string }>) {
    if (!userId.trim()) return setError("Enter a user ID.");
    setResult(null);
    run(async () => {
      const res = await fn(userId.trim());
      setResult(res.detail);
    });
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-semibold text-ink">User actions</h2>
      <p className="mt-1 text-sm text-muted">
        Act on an account by its ID (from the verification queue or a report). Suspension needs the{" "}
        <span className="font-medium text-ink">manager</span> tier; banning needs{" "}
        <span className="font-medium text-ink">super admin</span>.
      </p>

      <Card className="mt-5 p-5">
        <Field label="User ID">
          <Input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="font-mono"
          />
        </Field>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-hair p-3">
            <p className="text-sm font-medium text-ink">Suspend</p>
            <p className="mt-0.5 text-xs text-muted">Blocks publishing, booking, messaging. Can still log in.</p>
            <div className="mt-2 flex gap-2">
              <Button onClick={() => act(api.suspendUser)} loading={loading}>
                Suspend
              </Button>
              <Button variant="secondary" onClick={() => act(api.reactivateUser)} loading={loading}>
                Reactivate
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-hair p-3">
            <p className="text-sm font-medium text-ink">Ban</p>
            <p className="mt-0.5 text-xs text-muted">Blocks login entirely. For serious, confirmed cases.</p>
            <div className="mt-2 flex gap-2">
              <Button variant="danger" onClick={() => act(api.banUser)} loading={loading}>
                Ban
              </Button>
              <Button variant="secondary" onClick={() => act(api.unbanUser)} loading={loading}>
                Unban
              </Button>
            </div>
          </div>
        </div>

        {result && (
          <div className="mt-4">
            <Alert tone="ok">{result}</Alert>
          </div>
        )}
        {error && (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        )}
      </Card>
    </div>
  );
}
