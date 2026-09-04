"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useApi, useAction } from "@/lib/useApi";
import { useAuth } from "@/lib/auth";
import { Alert, Button, Card, Field, Input, Select } from "@/components/ui";
import type { UserRole } from "@/lib/types";

const ROLE_OPTIONS: { value: UserRole; label: string; hint: string }[] = [
  { value: "client", label: "Client", hint: "Browse and book companions" },
  { value: "companion", label: "Companion", hint: "List your own profile (independent or with an agency)" },
  { value: "agent", label: "Agency", hint: "Manage a roster of companions" },
];

export default function SignupPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { data: legal } = useApi(() => api.legalVersions(), []);
  const { loading, error, run, setError } = useAction();

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("client");
  const [acceptTos, setAcceptTos] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);

  const canSubmit = email && password.length >= 10 && acceptTos && acceptPrivacy;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptTos || !acceptPrivacy) {
      setError("You must accept the Terms of Service and Privacy Policy to create an account.");
      return;
    }
    run(async () => {
      await api.signup({
        email,
        password,
        phone: phone || undefined,
        role,
        accept_tos: acceptTos,
        accept_privacy_policy: acceptPrivacy,
      });
      await login(email, password);
      router.push(role === "client" ? "/browse" : "/profile");
    });
  }

  return (
    <div className="mx-auto max-w-md py-6">
      <h1 className="text-gradient w-fit font-display text-3xl font-semibold tracking-tight">Create your account</h1>
      <p className="mt-2 text-sm text-muted">
        {role === "client"
          ? "As a client, you only confirm you're 18 or older — no ID verification needed."
          : "You'll verify your age and identity (21+) with an ID document before publishing a profile."}
      </p>

      <Card className="mt-6 p-6">
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          <Field label="Phone" hint="Optional">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27…" />
          </Field>
          <Field label="Password" hint="At least 10 characters">
            <Input type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="I am signing up as a…">
            <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} — {r.hint}
                </option>
              ))}
            </Select>
          </Field>

          <div className="mt-1 flex flex-col gap-3 rounded-lg bg-surface-2 p-3.5">
            <Consent checked={acceptTos} onChange={setAcceptTos}>
              I accept the{" "}
              <Link href="/legal/terms" className="text-accent-ink underline">
                Terms of Service
              </Link>
              {legal && <span className="text-faint"> (v{legal.tos_version})</span>}
            </Consent>
            <Consent checked={acceptPrivacy} onChange={setAcceptPrivacy}>
              I accept the{" "}
              <Link href="/legal/privacy" className="text-accent-ink underline">
                Privacy Policy
              </Link>
              {legal && <span className="text-faint"> (v{legal.privacy_policy_version})</span>}
            </Consent>
          </div>

          {error && <Alert>{error}</Alert>}

          <Button type="submit" loading={loading} disabled={!canSubmit}>
            Create account
          </Button>
        </form>
      </Card>

      <p className="mt-4 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent-ink">
          Log in
        </Link>
      </p>
    </div>
  );
}

function Consent({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 flex-none accent-[var(--accent)]"
      />
      <span>{children}</span>
    </label>
  );
}
