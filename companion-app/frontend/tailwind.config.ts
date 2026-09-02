import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ground: "var(--ground)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        hair: "var(--hair)",
        "hair-strong": "var(--hair-strong)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        "accent-ink": "var(--accent-ink)",
        ok: "var(--ok)",
        "ok-soft": "var(--ok-soft)",
        warn: "var(--warn)",
        "warn-soft": "var(--warn-soft)",
        block: "var(--block)",
        "block-soft": "var(--block-soft)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(36,30,40,.04), 0 6px 20px -12px rgba(36,30,40,.14)",
      },
      borderRadius: {
        xl2: "14px",
      },
    },
  },
  plugins: [],
};
export default config;
