import Link from "next/link";

const LINKS = [
  { href: "/browse", label: "Browse" },
  { href: "/parental-controls", label: "Parental controls" },
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/privacy", label: "Privacy Policy" },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-hair">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <span className="font-display text-lg font-semibold tracking-tight text-ink">Amicora</span>
          <p className="mt-1 max-w-md text-xs leading-relaxed text-faint">
            Adults only (18+). A listing and introduction service — never party to the companionship
            fee. Listed companions are age- and identity-verified (21+).
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-4 gap-y-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-muted hover:text-ink">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
