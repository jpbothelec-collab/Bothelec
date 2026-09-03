import Link from "next/link";
import { Badge } from "./ui";
import { CATEGORY_LABELS, type CompanionProfile } from "@/lib/types";

export function ProfileCard({ p }: { p: CompanionProfile }) {
  return (
    <Link
      href={`/companions/${p.id}`}
      className="group flex flex-col overflow-hidden rounded-xl2 border border-hair bg-surface shadow-card transition-transform hover:-translate-y-0.5"
    >
      <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-accent-soft">
        {p.media[0]?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.media[0].url}
            alt={p.display_name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <span className="font-display text-5xl font-semibold text-accent-ink/70">
            {p.display_name.slice(0, 1).toUpperCase()}
          </span>
        )}
        {p.total_image_count > 0 && (
          <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-medium text-white">
            {p.total_image_count} photo{p.total_image_count > 1 ? "s" : ""}
          </span>
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
