"use client";

import { useCallback, useEffect, useState } from "react";
import SmartImage from "@/components/SmartImage";
import { ReelCard } from "@/components/grooming/ReelStack";
import { adminRequest } from "@/lib/admin-client";
import { parseContent } from "@/lib/grooming/content";
import { instagramPermalink } from "@/lib/grooming/instagram";
import type { ContentKind, GalleryItem, GroomingVideo, Testimonial } from "@/lib/grooming/types";

type Item = GroomingVideo | GalleryItem | Testimonial;
type Draft = Record<string, unknown>;

const COPY: Record<ContentKind, { title: string; intro: string; add: string; empty: string }> = {
  videos: {
    title: "Grooming videos",
    intro: "Instagram Reels shown in “A store built for happy pets”. Paste a Reel link; the page shows a cover and loads Instagram only when a visitor presses play. Show 4–5 for the best effect.",
    add: "Add a video",
    empty: "No videos yet. The section stays hidden on the page until you add one.",
  },
  gallery: {
    title: "Happy pets gallery",
    intro: "Photos of pets from the store. Tick “Sample photo” for stock pictures: they're labelled as samples and shown without pet names.",
    add: "Add a photo",
    empty: "No photos. The gallery is hidden on the page until you add one.",
  },
  testimonials: {
    title: "Testimonials",
    intro: "Real reviews from customers. The section stays hidden on the page until at least one is published. Only add reviews customers actually gave.",
    add: "Add a review",
    empty: "No reviews yet.",
  },
};

const blank: Record<ContentKind, Draft> = {
  videos: { url: "", title: "", petName: "", breed: "", description: "", testimonial: "", coverSrc: "", active: true },
  gallery: { src: "", alt: "", petName: "", breed: "", service: "", caption: "", credit: "", isSample: false, active: true },
  testimonials: { customerName: "", petName: "", rating: 5, text: "", instagramUrl: "", date: "", active: true },
};

function toDraft(kind: ContentKind, item: Item): Draft {
  if (kind === "videos") {
    const v = item as GroomingVideo;
    return { ...blank.videos, ...v, url: instagramPermalink(v.kind, v.shortcode) };
  }
  return { ...blank[kind], ...item };
}

/** Big phone photos are shrunk in the browser first (the upload limit is 5 MB). */
async function shrink(file: File): Promise<Blob> {
  if (file.size < 3.5 * 1024 * 1024 || !file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.88));
  } catch {
    return file;
  }
}

function PhotoField({ value, onChange, label }: { value: string; onChange: (src: string) => void; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async (file: File) => {
    setBusy(true);
    setError("");
    const form = new FormData();
    form.append("file", await shrink(file), file.name.replace(/\.\w+$/, ".jpg"));
    const res = await adminRequest<{ src: string }>("/api/admin/grooming/media", { method: "POST", body: form });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    onChange(res.src);
  };
  return (
    <div className="admin-field admin-gr-photo">
      <span>{label}</span>
      {value && (
        <div className="admin-gr-photo__preview img-slot">
          <SmartImage src={value} alt="" width={240} height={300} sizes="120px" />
        </div>
      )}
      <label className="admin-btn admin-btn--sm">
        {busy ? "Uploading…" : value ? "Replace photo" : "Upload photo"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/heic"
          className="visually-hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = "";
          }}
        />
      </label>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Fields({ kind, draft, set, errors }: { kind: ContentKind; draft: Draft; set: (patch: Draft) => void; errors: Record<string, string> }) {
  const text = (name: string, label: string, opts: { area?: boolean; placeholder?: string; type?: string } = {}) => (
    <label className="admin-field">
      <span>{label}</span>
      {opts.area ? (
        <textarea rows={3} value={String(draft[name] ?? "")} placeholder={opts.placeholder} onChange={(e) => set({ [name]: e.target.value })} aria-invalid={!!errors[name] || undefined} />
      ) : (
        <input type={opts.type ?? "text"} value={String(draft[name] ?? "")} placeholder={opts.placeholder} onChange={(e) => set({ [name]: e.target.value })} aria-invalid={!!errors[name] || undefined} />
      )}
      {errors[name] && <span className="admin-error">{errors[name]}</span>}
    </label>
  );
  if (kind === "videos")
    return (
      <>
        {text("url", "Instagram Reel link", { placeholder: "https://www.instagram.com/reel/…" })}
        {text("title", "Title")}
        <div className="admin-field-row">
          {text("petName", "Pet name (optional)")}
          {text("breed", "Breed (optional)")}
        </div>
        {text("description", "Short description (optional)", { area: true })}
        {text("testimonial", "Customer quote (optional, only a real one)", { area: true })}
        <PhotoField label="Cover image (optional; otherwise a branded card is shown)" value={String(draft.coverSrc ?? "")} onChange={(src) => set({ coverSrc: src })} />
      </>
    );
  if (kind === "gallery")
    return (
      <>
        <PhotoField label="Photo" value={String(draft.src ?? "")} onChange={(src) => set({ src })} />
        {errors.src && <span className="admin-error">{errors.src}</span>}
        {text("alt", "Describe the photo (for screen readers)", { placeholder: "e.g. Bruno the beagle after his spa bath" })}
        <div className="admin-field-row">
          {text("petName", "Pet name")}
          {text("breed", "Breed")}
          {text("service", "Grooming service (optional)")}
        </div>
        {text("caption", "Caption (optional)")}
        <label className="admin-check">
          <input type="checkbox" checked={draft.isSample === true} onChange={(e) => set({ isSample: e.target.checked })} /> Sample / stock photo (not a real customer)
        </label>
        {draft.isSample === true && text("credit", "Photo credit (optional)")}
      </>
    );
  return (
    <>
      <div className="admin-field-row">
        {text("customerName", "Customer name")}
        {text("petName", "Pet name (optional)")}
        <label className="admin-field">
          <span>Rating</span>
          <select value={String(draft.rating ?? 5)} onChange={(e) => set({ rating: Number(e.target.value) })}>
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>
                {"★".repeat(r)} ({r})
              </option>
            ))}
          </select>
        </label>
        {text("date", "Date (optional)", { type: "date" })}
      </div>
      {text("text", "Review text", { area: true })}
      {text("instagramUrl", "Instagram video link (optional)")}
    </>
  );
}

export default function ContentManager({ kind }: { kind: ContentKind }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(blank[kind]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const copy = COPY[kind];
  const api = `/api/admin/grooming/content/${kind}`;

  const load = useCallback(async () => {
    const res = await adminRequest<{ items: Item[] }>(api);
    if (!res.ok) return setError(res.message);
    setItems(res.items);
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (req: Promise<{ ok: true; items: Item[] } | { ok: false; message: string; errors?: Record<string, string> }>, done: string) => {
    setBusy(true);
    setMessage(null);
    const res = (await req) as { ok: true; items: Item[] } | { ok: false; message: string; errors?: Record<string, string> };
    setBusy(false);
    if (!res.ok) {
      setMessage({ tone: "error", text: res.message });
      if (res.errors) setErrors(res.errors);
      return false;
    }
    setItems(res.items);
    setMessage({ tone: "ok", text: done });
    return true;
  };

  const startEdit = (item: Item | null) => {
    setEditing(item ? item.id : "new");
    setDraft(item ? toDraft(kind, item) : { ...blank[kind] });
    setErrors({});
    setMessage(null);
  };

  const save = async () => {
    const check = parseContent[kind](draft, { id: "check", order: 0 });
    if (!check.ok) return setErrors(check.errors);
    const ok =
      editing === "new"
        ? await run(adminRequest<{ items: Item[] }>(api, { method: "POST", json: draft }) as never, "Added. It's live on the grooming page.")
        : await run(adminRequest<{ items: Item[] }>(`${api}/${editing}`, { method: "PATCH", json: draft }) as never, "Saved.");
    if (ok) setEditing(null);
  };

  const move = (index: number, delta: number) => {
    if (!items) return;
    const next = [...items];
    const [it] = next.splice(index, 1);
    next.splice(index + delta, 0, it!);
    setItems(next);
    void run(adminRequest<{ items: Item[] }>(api, { method: "PUT", json: { ids: next.map((i) => i.id) } }) as never, "Order saved.");
  };

  const label = (item: Item) =>
    kind === "videos" ? (item as GroomingVideo).title : kind === "gallery" ? ((item as GalleryItem).petName ?? (item as GalleryItem).alt) : `${(item as Testimonial).customerName}: “${(item as Testimonial).text.slice(0, 60)}…”`;

  return (
    <section aria-labelledby="gr-content-title">
      <div className="admin-toolbar">
        <h1 id="gr-content-title">{copy.title}</h1>
        <div className="admin-toolbar__actions">
          <button type="button" className="admin-btn admin-btn--primary" onClick={() => startEdit(null)} disabled={busy || editing !== null}>
            {copy.add}
          </button>
        </div>
      </div>
      <p className="admin-muted">{copy.intro}</p>
      {message && (
        <p className={`admin-message admin-message--${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}
      {error && <p className="admin-empty" role="alert">{error}</p>}

      {editing && (
        <form
          className="admin-card admin-gr-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <h2 className="admin-subtitle">{editing === "new" ? copy.add : "Edit"}</h2>
          <Fields kind={kind} draft={draft} set={(p) => setDraft((d) => ({ ...d, ...p }))} errors={errors} />
          <label className="admin-check">
            <input type="checkbox" checked={draft.active !== false} onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))} /> Published (shown on the page)
          </label>
          <div className="admin-actions">
            <button type="submit" className="admin-btn admin-btn--primary" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {items && items.length === 0 && <p className="admin-empty">{copy.empty}</p>}
      {items && items.length > 0 && (
        <ol className="admin-gr-content">
          {items.map((item, i) => (
            <li key={item.id} className="admin-gr-content__item" data-inactive={!item.active || undefined}>
              {kind === "gallery" && (
                <div className="admin-gr-content__thumb img-slot">
                  <SmartImage src={(item as GalleryItem).src} alt="" width={120} height={150} sizes="60px" />
                </div>
              )}
              <div className="admin-gr-content__main">
                <strong>{label(item)}</strong>
                <span className="admin-muted">
                  {item.active ? "Published" : "Hidden"}
                  {kind === "gallery" && (item as GalleryItem).isSample ? " · sample photo" : ""}
                  {kind === "videos" ? ` · instagram.com/${(item as GroomingVideo).kind}/${(item as GroomingVideo).shortcode}` : ""}
                  {kind === "testimonials" ? ` · ${"★".repeat((item as Testimonial).rating)}` : ""}
                </span>
              </div>
              <div className="admin-row__actions">
                <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={() => move(i, -1)} disabled={busy || i === 0} aria-label={`Move ${label(item)} up`}>
                  ▲
                </button>
                <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={() => move(i, 1)} disabled={busy || i === items.length - 1} aria-label={`Move ${label(item)} down`}>
                  ▼
                </button>
                {kind === "videos" && (
                  <button type="button" className="admin-btn admin-btn--sm" onClick={() => setPreview(preview === item.id ? null : item.id)}>
                    {preview === item.id ? "Close preview" : "Preview"}
                  </button>
                )}
                <button
                  type="button"
                  className="admin-btn admin-btn--sm"
                  onClick={() => void run(adminRequest<{ items: Item[] }>(`${api}/${item.id}`, { method: "PATCH", json: { active: !item.active } }) as never, item.active ? "Hidden from the page." : "Published.")}
                  disabled={busy}
                >
                  {item.active ? "Unpublish" : "Publish"}
                </button>
                <button type="button" className="admin-btn admin-btn--sm" onClick={() => startEdit(item)} disabled={busy}>
                  Edit
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--sm admin-btn--danger"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Delete “${label(item)}”? This can't be undone.`))
                      void run(adminRequest<{ items: Item[] }>(`${api}/${item.id}`, { method: "DELETE" }) as never, "Deleted.");
                  }}
                >
                  Delete
                </button>
              </div>
              {kind === "videos" && preview === item.id && (
                <div className="admin-gr-content__preview grooming-page">
                  <ReelCard video={item as GroomingVideo} index={0} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
