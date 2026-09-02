"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/useApi";
import { Alert, Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import { ADMIN_LEVEL_LABELS, type AdminLevel, type AdminLevelResponse } from "@/lib/types";
import { LEVEL_PERMISSIONS } from "@/lib/permissions";

export default function AdminsPage() {
  const [userId, setUserId] = useState("");
  const [level, setLevel] = useState<AdminLevel>("moderator");
  const { loading, error, run, setError } = useAction();
  const [result, setResult] = useState<AdminLevelResponse | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId.trim()) return setError("Enter the admin's user ID.");
    setResult(null);
    run(async () => {
      const res = await api.setAdminLevel(userId.trim(), level);
      setResult(res);
    });
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-semibold text-ink">Assign admin tier</h2>
      <p className="mt-1 text-sm text-muted">
        Requires the <span className="font-medium text-ink">super admin</span> tier. The target must
        already be an admin account — the first super admin is seeded directly in the database.
      </p>

      <Card className="mt-5 p-5">
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Field label="Admin user ID">
            <Input value={userId} onChange={(e) => setUserId(e.target.value)} className="font-mono" placeholder="uuid" />
          </Field>
          <Field label="Tier">
            <Select value={level} onChange={(e) => setLevel(e.target.value as AdminLevel)}>
              {(Object.keys(ADMIN_LEVEL_LABELS) as AdminLevel[]).map((l) => (
                <option key={l} value={l}>
                  {ADMIN_LEVEL_LABELS[l]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="rounded-lg bg-surface-2 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">
              {ADMIN_LEVEL_LABELS[level]} can
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {LEVEL_PERMISSIONS[level].map((p) => (
                <Badge key={p} tone="accent">
                  {p.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
          </div>

          {error && <Alert>{error}</Alert>}
          {result && (
            <Alert tone="ok">
              {result.detail} — permissions: {result.permissions.join(", ")}
            </Alert>
          )}
          <Button type="submit" loading={loading}>
            Assign tier
          </Button>
        </form>
      </Card>
    </div>
  );
}
