import Link from "next/link";
import { Badge } from "./ui";
import { CATEGORY_LABELS, type PublicProfile } from "@/lib/types";

export function ProfileCard({ p }: { p: PublicProfile }) {
  const cover = p.image_urls[0];
  return (
    <Link
      href={`/companions/${p.id}`}
      className="group flex flex-col overflow-hidden rounded-xl2 border border-hair bg-surface shadow-card transition-transform hover:-translate-y-0.5"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-surface-2">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={p.display_name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center font-display text-4xl text-hair-strong">
            {p.display_name.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-medium text-ink">{p.display_name}</h3>
          {p.city && <span className="text-xs text-muted">{p.city}</span>}
        </div>
        {p.categories.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {p.categories.slice(0, 3).map((c) => (
              <Badge key={c}>{CATEGORY_LABELS[c]}</Badge>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
