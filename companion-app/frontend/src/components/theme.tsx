"use client";

import { useEffect, useState } from "react";

type Mode = "light" | "dark" | "system";

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    let stored: Mode = "system";
    try {
      stored = (localStorage.getItem("amicora_theme") as Mode) || "system";
    } catch {
      /* ignore */
    }
    setMode(stored);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
    try {
      localStorage.setItem("amicora_theme", mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  const next: Record<Mode, Mode> = { system: "light", light: "dark", dark: "system" };
  const label: Record<Mode, string> = { system: "Auto", light: "Light", dark: "Dark" };

  return (
    <button
      type="button"
      onClick={() => setMode(next[mode])}
      className="rounded-lg border border-hair px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surface-2"
      title="Toggle theme"
    >
      {label[mode]}
    </button>
  );
}
