export const money = (v: string | number | null | undefined) => `R${Number(v ?? 0).toFixed(2)}`;

export const VEHICLE_LABELS: Record<string, string> = { economy: "Economy", comfort: "Comfort", xl: "XL" };

export function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export const trips = (n: number | undefined) => `${n ?? 0} trip${n === 1 ? "" : "s"}`;
