"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useAction } from "@/lib/useApi";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();
  const { loading, error, run } = useAction();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      await login(email, password);
      router.push(params.get("next") || "/account");
    });
  }

  return (
    <div className="mx-auto max-w-md py-6">
      <h1 className="text-gradient w-fit font-display text-3xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-sm text-muted">Log in to manage your profile, bookings and account.</p>

      <Card className="mt-6 p-6">
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password">
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={loading} disabled={!email || !password}>
            Log in
          </Button>
        </form>
      </Card>

      <p className="mt-4 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="font-medium text-accent-ink">
          Create an account
        </Link>
      </p>
    </div>
  );
}
