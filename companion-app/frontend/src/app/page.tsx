import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col gap-16 py-6">
      {/* hero */}
      <section className="flex flex-col gap-5">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent-ink">
          <span className="bg-grad-brand inline-block h-[3px] w-7 rounded-full" />
          South Africa · 18+
        </span>
        <h1 className="max-w-2xl text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-5xl">
          Companionship, arranged with <span className="text-gradient">care</span>.
        </h1>
        <p className="max-w-xl text-[15px] leading-relaxed text-muted">
          Amicora is a listing and introduction service. Verified companions and agencies publish
          profiles; clients browse and request time together. The companionship fee is always
          settled directly between you — Amicora is never party to it.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            href="/browse"
            className="bg-grad-brand rounded-lg px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-accent/30 hover:brightness-110"
          >
            Browse companions
          </Link>
          <Link
            href="/signup"
            className="rounded-lg border border-hair-strong px-5 py-2.5 text-sm font-medium text-ink hover:bg-surface-2"
          >
            List your profile
          </Link>
        </div>
      </section>

      {/* how it works */}
      <section className="flex flex-col gap-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">How it works</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-xl2 border border-hair bg-surface p-5 shadow-card">
              <div className="mb-3 font-mono text-sm text-faint">{String(i + 1).padStart(2, "0")}</div>
              <h3 className="text-base font-semibold text-ink">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* trust */}
      <section className="rounded-xl2 border border-hair bg-surface-2 p-6 sm:p-8">
        <h2 className="font-display text-xl font-semibold text-ink">Built for trust &amp; safety</h2>
        <div className="mt-4 grid gap-x-8 gap-y-4 text-sm text-muted sm:grid-cols-2">
          {TRUST.map((t) => (
            <div key={t.title} className="flex gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-accent" />
              <p>
                <span className="font-medium text-ink">{t.title}.</span> {t.body}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const STEPS = [
  {
    title: "Confirm your age",
    body: "Visitors confirm they're 18 or older to browse. Listed companions go further — their age and identity are verified from an ID document (21+).",
  },
  {
    title: "Publish or browse",
    body: "Companions keep a profile live with a monthly listing subscription. Clients browse published profiles by city and category — no ID needed.",
  },
  {
    title: "Request time together",
    body: "Send a booking request and message directly. The companionship fee is agreed and settled between you, off-platform.",
  },
];

const TRUST = [
  {
    title: "Age-checked",
    body: "Visitors confirm they're 18+; listed companions are ID-verified at 21+, a deliberate buffer enforced in code.",
  },
  {
    title: "POPIA-minded",
    body: "ID documents are stored encrypted, consented to explicitly, and purged after review.",
  },
  {
    title: "Moderated",
    body: "Portfolio images and messages are reviewed; users can report, and staff can act.",
  },
  {
    title: "Listing only",
    body: "Amicora introduces people. It never handles the companionship fee itself.",
  },
];
