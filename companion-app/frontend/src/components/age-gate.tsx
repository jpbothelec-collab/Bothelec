"use client";

import { useEffect, useState } from "react";

const KEY = "amicora_age_ok";

// Viewer age gate: a browser-level self-attestation that the visitor is 18+.
// This is deliberately NOT identity verification — only listers (companions/
// agents) verify their age with an ID document. Viewers just confirm here,
// and the choice is remembered in this browser.
type Status = "checking" | "ok" | "gate" | "blocked";

export function AgeGate() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let ok = false;
    try {
      ok = localStorage.getItem(KEY) === "1";
    } catch {
      /* storage unavailable — show the gate */
    }
    setStatus(ok ? "ok" : "gate");
  }, []);

  function confirm() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setStatus("ok");
  }

  if (status === "ok") return null;

  // While checking, and whenever the gate/block is shown, cover the page so
  // no content flashes before the visitor confirms.
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ground p-4">
      {status === "gate" && (
        <div className="w-full max-w-md rounded-xl2 border border-hair bg-surface p-7 text-center shadow-card">
          <span className="font-display text-2xl font-semibold tracking-tight text-ink">Amicora</span>
          <h1 className="mt-4 font-display text-xl font-semibold text-ink">Are you 18 or older?</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Amicora contains content intended for adults. Please confirm your age to continue. Listed
            companions are separately age- and identity-verified (21+).
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={confirm}
              className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              I am 18 or older — enter
            </button>
            <button
              type="button"
              onClick={() => setStatus("blocked")}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-muted hover:text-ink"
            >
              I am under 18
            </button>
          </div>
          <p className="mt-4 text-xs text-faint">
            By entering you confirm you are at least 18 years old.
          </p>
        </div>
      )}

      {status === "blocked" && (
        <div className="max-w-md text-center">
          <h1 className="font-display text-xl font-semibold text-ink">You must be 18 or older</h1>
          <p className="mt-2 text-sm text-muted">
            We&apos;re sorry, but you can&apos;t access Amicora. You may close this page.
          </p>
        </div>
      )}
    </div>
  );
}
