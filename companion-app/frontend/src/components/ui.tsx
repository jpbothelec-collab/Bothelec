"use client";

import { forwardRef } from "react";

type Cx = (string | false | null | undefined)[];
export const cx = (...c: Cx) => c.filter(Boolean).join(" ");

/* ---------- Button ---------- */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  loading?: boolean;
};
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const btnVariants: Record<BtnVariant, string> = {
  primary:
    "bg-grad-plum text-white shadow-sm shadow-accent/25 hover:brightness-110 active:brightness-95",
  secondary: "border border-hair-strong text-ink hover:bg-surface-2 hover:border-accent/40",
  ghost: "text-accent-ink hover:bg-accent-soft",
  danger: "bg-block text-white hover:opacity-90",
};
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = "primary", loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(btnBase, btnVariants[variant], className)}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      aria-hidden
    />
  );
}

/* ---------- Inputs ---------- */
const fieldBase =
  "w-full rounded-lg border border-hair bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cx(fieldBase, className)} {...rest} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(fieldBase, "min-h-24 resize-y", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={cx(fieldBase, "pr-8", className)} {...rest}>
        {children}
      </select>
    );
  },
);

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

/* ---------- Card ---------- */
export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        "rounded-xl2 border border-hair bg-surface shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ---------- Badge ---------- */
type Tone = "neutral" | "ok" | "warn" | "block" | "accent";
const toneCls: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-hair",
  ok: "bg-ok-soft text-ok border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  block: "bg-block-soft text-block border-transparent",
  accent: "bg-accent-soft text-accent-ink border-transparent",
};
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneCls[tone],
      )}
    >
      {children}
    </span>
  );
}

/* ---------- Alert ---------- */
export function Alert({
  tone = "block",
  children,
}: {
  tone?: "block" | "ok" | "warn" | "accent";
  children: React.ReactNode;
}) {
  const cls = {
    block: "bg-block-soft text-block",
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    accent: "bg-accent-soft text-accent-ink",
  }[tone];
  return (
    <div role="alert" className={cx("rounded-lg px-3.5 py-2.5 text-sm", cls)}>
      {children}
    </div>
  );
}

/* ---------- Stars (read-only rating) ---------- */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const rounded = Math.round(value);
  return (
    <span
      className="inline-flex"
      role="img"
      aria-label={`${value.toFixed(1)} out of 5`}
      style={{ fontSize: size, lineHeight: 1 }}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rounded ? "text-accent" : "text-hair-strong"}>
          ★
        </span>
      ))}
    </span>
  );
}

/* ---------- Empty / loading states ---------- */
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-muted">
      <Spinner /> {label}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl2 border border-dashed border-hair-strong px-6 py-12 text-center text-sm text-muted">
      {children}
    </div>
  );
}
