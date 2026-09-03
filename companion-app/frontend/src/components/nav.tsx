"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "./theme";
import { cx } from "./ui";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = path === href || (href !== "/" && path.startsWith(href));
  return (
    <Link
      href={href}
      className={cx(
        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-accent-soft text-accent-ink" : "text-muted hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}

export function SiteHeader() {
  const { user, ready, logout } = useAuth();
  const isAdmin = user?.role === "admin";
  const isProvider = user?.role === "companion" || user?.role === "agent";
  const canMessage =
    user?.role === "client" || user?.role === "companion" || user?.role === "agent";

  return (
    <header className="sticky top-0 z-20 border-b border-hair bg-ground/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-1 px-4 py-3 sm:px-6">
        <Link href="/" className="mr-2 font-display text-xl font-semibold tracking-tight text-ink">
          Amicora
        </Link>
        <nav className="flex items-center gap-0.5">
          <NavLink href="/browse">Browse</NavLink>
          {user && <NavLink href="/bookings">Bookings</NavLink>}
          {canMessage && <NavLink href="/messages">Messages</NavLink>}
          {isProvider && <NavLink href="/profile">My profile</NavLink>}
          {user && <NavLink href="/account">Account</NavLink>}
          {isAdmin && <NavLink href="/admin">Admin</NavLink>}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {ready && !user && (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:text-ink"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Sign up
              </Link>
            </>
          )}
          {ready && user && (
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-hair px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-2"
            >
              Log out
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
