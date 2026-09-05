"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApi, useAction } from "@/lib/useApi";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading } from "@/components/ui";
import type { BannerAd } from "@/lib/types";

export default function AdsPage() {
  const { data, error, loading, reload } = useApi(() => api.adminAds(), []);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-lg font-semibold text-ink">Banner ads</h2>
        <p className="mt-1 text-sm text-muted">
          Upload advertiser banners shown on the Browse page. Toggle to show/hide; remove to delete.
          Needs the <span className="font-medium text-ink">manager</span> tier or above.
        </p>
      </div>

      <NewAd onCreated={reload} />

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Current ads</h3>
        <div className="mt-3 flex flex-col gap-3">
          {loading && <Loading />}
          {error && <Alert>{error}</Alert>}
          {data && data.length === 0 && <Empty>No banner ads yet.</Empty>}
          {data?.map((ad) => (
            <AdRow key={ad.id} ad={ad} onChanged={reload} />
          ))}
        </div>
      </div>
    </div>
  );
}

function NewAd({ onCreated }: { onCreated: () => void }) {
  const { loading, error, run, setError } = useAction();
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [placement, setPlacement] = useState("browse");
  const [file, setFile] = useState<File | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Enter a title.");
    if (!file) return setError("Choose a banner image.");
    setOk(null);
    run(async () => {
      const form = new FormData();
      form.append("title", title.trim());
      form.append("link_url", link.trim());
      form.append("placement", placement.trim() || "browse");
      form.append("file", file);
      await api.adminCreateAd(form);
      setTitle("");
      setLink("");
      setFile(null);
      setOk("Ad created.");
      onCreated();
    });
  }

  return (
    <Card className="p-5">
      <h3 className="font-medium text-ink">Add a banner</h3>
      <form className="mt-4 flex flex-col gap-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field label="Placement" hint="Where it shows (e.g. browse).">
            <Input value={placement} onChange={(e) => setPlacement(e.target.value)} />
          </Field>
        </div>
        <Field label="Link URL" hint="Where the banner links to (optional).">
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://advertiser.example.com"
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            {file ? "Change image" : "Choose image"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {file && <span className="text-sm text-muted">{file.name}</span>}
        </div>
        {error && <Alert>{error}</Alert>}
        {ok && <Alert tone="ok">{ok}</Alert>}
        <div>
          <Button type="submit" loading={loading}>
            Create ad
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AdRow({ ad, onChanged }: { ad: BannerAd; onChanged: () => void }) {
  const { loading, error, run } = useAction();

  function toggle() {
    run(async () => {
      await api.adminToggleAd(ad.id);
      onChanged();
    });
  }
  function remove() {
    run(async () => {
      await api.adminDeleteAd(ad.id);
      onChanged();
    });
  }

  return (
    <Card className="flex flex-wrap items-center gap-4 p-4">
      <div className="h-16 w-28 flex-none overflow-hidden rounded-lg bg-surface-2">
        {ad.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ad.image_url} alt={ad.title} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-ink">{ad.title}</span>
          <Badge tone={ad.is_active ? "ok" : "neutral"}>{ad.is_active ? "Active" : "Hidden"}</Badge>
          <Badge>{ad.placement}</Badge>
        </div>
        {ad.link_url && (
          <a
            href={ad.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 block truncate text-xs text-accent-ink hover:underline"
          >
            {ad.link_url}
          </a>
        )}
        {error && <Alert>{error}</Alert>}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={toggle} loading={loading}>
          {ad.is_active ? "Hide" : "Show"}
        </Button>
        <Button variant="danger" onClick={remove} loading={loading}>
          Delete
        </Button>
      </div>
    </Card>
  );
}
