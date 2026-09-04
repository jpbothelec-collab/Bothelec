"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "./theme";
import { cx } from "./ui";

function NavLink({
  href,
  children,
  onClick,
  block,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
  block?: boolean;
}) {
  const path = usePathname();
  const active = path === href || (href !== "/" && path.startsWith(href));
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cx(
        "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        block && "block",
        active ? "bg-accent-soft text-accent-ink" : "text-muted hover:text-ink hover:bg-surface-2",
      )}
    >
      {children}
    </Link>
  );
}

export function SiteHeader() {
  const { user, ready, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const path = usePathname();

  // Close the mobile menu whenever the route changes.
  useEffect(() => setOpen(false), [path]);

  const isAdmin = user?.role === "admin";
  const isProvider = user?.role === "companion" || user?.role === "agent";
  const canMessage =
    user?.role === "client" || user?.role === "companion" || user?.role === "agent";

  const links = (block?: boolean) => (
    <>
      <NavLink href="/browse" block={block} onClick={() => setOpen(false)}>
        Browse
      </NavLink>
      {user && (
        <NavLink href="/bookings" block={block} onClick={() => setOpen(false)}>
          Bookings
        </NavLink>
      )}
      {canMessage && (
        <NavLink href="/messages" block={block} onClick={() => setOpen(false)}>
          Messages
        </NavLink>
      )}
      {isProvider && (
        <NavLink href="/profile" block={block} onClick={() => setOpen(false)}>
          My profile
        </NavLink>
      )}
      {user?.role === "agent" && (
        <NavLink href="/agency" block={block} onClick={() => setOpen(false)}>
          Agency
        </NavLink>
      )}
      {user && (
        <NavLink href="/account" block={block} onClick={() => setOpen(false)}>
          Account
        </NavLink>
      )}
      {isAdmin && (
        <NavLink href="/admin" block={block} onClick={() => setOpen(false)}>
          Admin
        </NavLink>
      )}
    </>
  );

  return (
    <header className="sticky top-0 z-20 border-b border-hair bg-ground/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-1 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="mr-1 flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-ink"
        >
          <span className="bg-grad-brand inline-block h-5 w-5 rounded-full" aria-hidden />
          Amicora
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-0.5 md:flex">{links()}</nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />

          {/* Desktop auth actions */}
          <div className="hidden items-center gap-2 md:flex">
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
                  className="bg-grad-plum rounded-lg px-3 py-1.5 text-sm font-medium text-white shadow-sm shadow-accent/25 hover:brightness-110"
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

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-hair text-ink hover:bg-surface-2 md:hidden"
          >
            {open ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>

      {/* Mobile menu panel */}
      {open && (
        <div className="border-t border-hair bg-ground/95 backdrop-blur md:hidden">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 px-4 py-3">
            {links(true)}
            <div className="mt-2 flex flex-col gap-2 border-t border-hair pt-3">
              {ready && !user && (
                <>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="rounded-lg border border-hair-strong px-3 py-2 text-center text-sm font-medium text-ink hover:bg-surface-2"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setOpen(false)}
                    className="bg-grad-plum rounded-lg px-3 py-2 text-center text-sm font-medium text-white shadow-sm shadow-accent/25 hover:brightness-110"
                  >
                    Sign up
                  </Link>
                </>
              )}
              {ready && user && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    logout();
                  }}
                  className="rounded-lg border border-hair px-3 py-2 text-sm font-medium text-muted hover:bg-surface-2"
                >
                  Log out
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function IconMenu() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
