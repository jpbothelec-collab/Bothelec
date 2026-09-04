"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { ProfileCard } from "@/components/profile-card";
import { Alert, Empty, Input, Loading, Select } from "@/components/ui";
import { CATEGORY_LABELS, type CompanionshipCategory } from "@/lib/types";

export default function BrowsePage() {
  const [city, setCity] = useState("");
  const [category, setCategory] = useState<CompanionshipCategory | "">("");
  // committed filters (applied on submit) so typing doesn't refetch each keystroke
  const [applied, setApplied] = useState<{ city?: string; category?: CompanionshipCategory }>({});

  const { data, error, loading } = useApi(
    () => api.searchProfiles(applied),
    [applied.city, applied.category],
  );

  function apply(e: React.FormEvent) {
    e.preventDefault();
    setApplied({
      city: city.trim() || undefined,
      category: category || undefined,
    });
  }

  return (
    <div className="py-6">
      <h1 className="text-gradient w-fit font-display text-3xl font-semibold tracking-tight">
        Browse companions
      </h1>
      <p className="mt-2 text-sm text-muted">Published, verified profiles across South Africa.</p>

      <form onSubmit={apply} className="mt-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">City</span>
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Cape Town" className="w-48" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Category</span>
          <Select value={category} onChange={(e) => setCategory(e.target.value as CompanionshipCategory | "")} className="w-52">
            <option value="">All categories</option>
            {(Object.keys(CATEGORY_LABELS) as CompanionshipCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </label>
        <button
          type="submit"
          className="bg-grad-plum rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm shadow-accent/25 hover:brightness-110"
        >
          Search
        </button>
      </form>

      <div className="mt-8">
        {loading && <Loading />}
        {error && <Alert>{error}</Alert>}
        {data && data.items.length === 0 && <Empty>No companions match those filters yet.</Empty>}
        {data && data.items.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {data.items.map((p) => (
              <ProfileCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
