"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Card, Loading } from "./ui";
import type { UserRole } from "@/lib/types";

export function RequireAuth({
  roles,
  children,
}: {
  roles?: UserRole[];
  children: React.ReactNode;
}) {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  if (!user) {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <p className="text-sm text-muted">You need to be logged in to view this page.</p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Log in
        </Link>
      </Card>
    );
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <Card className="mx-auto max-w-md p-6 text-center text-sm text-muted">
        This area isn&apos;t available for your account type.
      </Card>
    );
  }
  return <>{children}</>;
}
