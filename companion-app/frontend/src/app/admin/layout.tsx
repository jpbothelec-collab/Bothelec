"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RequireAuth } from "@/components/guard";
import { cx } from "@/components/ui";

const TABS = [
  { href: "/admin", label: "Verification" },
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/admins", label: "Admin tiers" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <RequireAuth roles={["admin"]}>
      <div className="py-6">
        <div className="flex items-center gap-2">
          <h1 className="text-gradient w-fit font-display text-3xl font-semibold tracking-tight">Admin</h1>
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-ink">
            staff
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">
          What you can do here depends on your tier — the server enforces it, so some actions may be
          declined.
        </p>

        <nav className="mt-5 flex flex-wrap gap-1 border-b border-hair">
          {TABS.map((t) => {
            const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cx(
                  "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
                  active
                    ? "border-accent text-ink"
                    : "border-transparent text-muted hover:text-ink",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6">{children}</div>
      </div>
    </RequireAuth>
  );
}
