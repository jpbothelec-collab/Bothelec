import type { Metadata } from "next";
import { ParentalGuidance } from "@/components/parental-guidance";

export const metadata: Metadata = {
  title: "Parental controls · Amicora",
  description: "How to block Amicora and other adult sites on children's devices.",
};

export default function ParentalControlsPage() {
  return (
    <article className="mx-auto max-w-2xl py-6">
      <h1 className="text-gradient w-fit font-display text-3xl font-semibold tracking-tight">
        Parental controls
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Amicora is an adults-only service. Access by anyone under 18 is strictly prohibited, and
        every visitor must confirm they are 18 or older before browsing. If you are a parent or
        guardian, here is how to keep this and other adult sites off your child&apos;s devices.
      </p>

      <div className="mt-6 rounded-xl2 border border-hair bg-surface p-6 shadow-card">
        <ParentalGuidance />
      </div>

      <p className="mt-4 text-xs text-faint">
        Amicora carries the RTA (&ldquo;Restricted to Adults&rdquo;) label, which parental-control
        and content-filtering software detects automatically.
      </p>
    </article>
  );
}
