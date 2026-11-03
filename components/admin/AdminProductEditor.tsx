"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { adminRequest } from "@/lib/admin-client";
import {
  CATEGORIES,
  IMAGE_VIEWS,
  centsToInput,
  parseMoneyInput,
  publishProblems,
  validateEditable,
  type CatalogProduct,
  type EditableFields,
  type FieldErrors,
} from "@/lib/catalog-core/schema";
import { STORE_MONEY } from "@/lib/store-config";
import type { Category, ImageView, ProductImage } from "@/lib/types";

interface FormState {
  name: string;
  category: Category | "";
  subcategory: string;
  brand: string;
  description: string;
  price: string;
  compareAt: string;
  stock: string;
  badge: string;
  featuredToday: boolean;
  images: ProductImage[];
  attributes: { key: string; value: string }[];
  labelJson: string;
  reviewFlags: string[];
  /** Pack sizes, as typed (money as text, like the single price fields). */
  variants: { id: string; label: string; price: string; compareAt: string; stock: string }[];
}

const emptyForm: FormState = {
  name: "", category: "", subcategory: "", brand: "", description: "", price: "", compareAt: "", stock: "",
  badge: "", featuredToday: false, images: [], attributes: [], labelJson: "", reviewFlags: [], variants: [],
};

const toForm = (p: CatalogProduct): FormState => ({
  name: p.name,
  category: p.category,
  subcategory: p.subcategory ?? "",
  brand: p.brand ?? "",
  description: p.description,
  price: centsToInput(p.priceCents),
  compareAt: centsToInput(p.compareAtCents),
  stock: p.stock === null ? "" : String(p.stock),
  badge: p.badge ?? "",
  featuredToday: p.featuredToday,
  images: p.images,
  attributes: Object.entries(p.attributes).map(([key, value]) => ({ key, value })),
  labelJson: p.label ? JSON.stringify(p.label, null, 2) : "",
  reviewFlags: p.reviewFlags,
  variants: (p.variants ?? []).map((v) => ({
    id: v.id,
    label: v.label,
    price: centsToInput(v.priceCents),
    compareAt: centsToInput(v.compareAtCents),
    stock: v.stock === null ? "" : String(v.stock),
  })),
});

/** Form -> API fields, with the same rules the server applies (schema.ts). */
function toFields(form: FormState): { fields: EditableFields | null; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const price = parseMoneyInput(form.price);
  if (price === "invalid") errors.priceCents = "Use a number like 12.99 (no currency sign).";
  const compareAt = parseMoneyInput(form.compareAt);
  if (compareAt === "invalid") errors.compareAtCents = "Use a number like 15.99, or leave it empty.";
  const stockText = form.stock.trim();
  const stock = stockText === "" ? null : /^\d+$/.test(stockText) ? Number(stockText) : NaN;
  if (Number.isNaN(stock)) errors.stock = "Stock must be a whole number (0 or more).";
  let label: unknown = null;
  if (form.labelJson.trim()) {
    try {
      label = JSON.parse(form.labelJson);
    } catch {
      errors.label = "Label text isn't valid JSON. Check quotes and commas.";
    }
  }
  const attributes: Record<string, string> = {};
  for (const { key, value } of form.attributes) if (key.trim() || value.trim()) attributes[key.trim()] = value;

  const variants = [];
  for (const v of form.variants) {
    if (!v.label.trim() && !v.price.trim() && !v.stock.trim()) continue; // an untouched new row
    const vPrice = parseMoneyInput(v.price);
    const vWas = parseMoneyInput(v.compareAt);
    const vStockText = v.stock.trim();
    const vStock = vStockText === "" ? null : /^\d+$/.test(vStockText) ? Number(vStockText) : NaN;
    if (vPrice === "invalid" || vWas === "invalid" || Number.isNaN(vStock)) {
      errors.variants = `Pack "${v.label || "?"}": use numbers like 310 for prices and whole numbers for stock.`;
      continue;
    }
    variants.push({ id: v.id || undefined, label: v.label, priceCents: vPrice, compareAtCents: vWas, stock: vStock });
  }

  const raw = {
    name: form.name,
    category: form.category,
    subcategory: form.subcategory,
    brand: form.brand,
    description: form.description,
    priceCents: typeof price === "number" ? price : null,
    compareAtCents: typeof compareAt === "number" ? compareAt : null,
    stock: typeof stock === "number" && !Number.isNaN(stock) ? stock : null,
    badge: form.badge,
    featuredToday: form.featuredToday,
    images: form.images,
    variants,
    attributes,
    label,
    reviewFlags: form.reviewFlags,
  };
  const checked = validateEditable(raw);
  if (!checked.ok) Object.assign(errors, checked.errors, errors);
  return { fields: Object.keys(errors).length || !checked.ok ? null : checked.value, errors };
}

type Props = { mode: "create" } | { mode: "edit"; product: CatalogProduct };

/** Same text on the server and in the browser (toLocaleString() differs between them). */
const stamp = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

export default function AdminProductEditor(props: Props) {
  const router = useRouter();
  const [product, setProduct] = useState<CatalogProduct | null>(props.mode === "edit" ? props.product : null);
  const initial = useMemo(() => (product ? toForm(product) : emptyForm), [product]);
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; problems?: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const messageRef = useRef<HTMLDivElement>(null);

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const say = (tone: "ok" | "error", text: string, problems?: string[]) => {
    setMessage({ tone, text, problems });
    requestAnimationFrame(() => messageRef.current?.focus());
  };

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    const { fields, errors: found } = toFields(form);
    setErrors(found);
    if (!fields) {
      say("error", "Please fix the highlighted fields.");
      return;
    }
    setBusy("save");
    const result =
      props.mode === "create" && !product
        ? await adminRequest<{ product: CatalogProduct }>("/api/admin/products", { method: "POST", json: { fields } })
        : await adminRequest<{ product: CatalogProduct }>(`/api/admin/products/${product!.id}`, {
            method: "PATCH",
            json: { expectedUpdatedAt: product!.updatedAt, fields },
          });
    setBusy(null);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      say("error", result.message, result.problems);
      return;
    }
    if (props.mode === "create" && !product) {
      router.replace(`/admin/products/${result.product.id}?created=1`);
      return;
    }
    setProduct(result.product);
    setForm(toForm(result.product));
    say("ok", "Saved.");
    router.refresh();
  };

  const changeStatus = async (action: "publish" | "unpublish" | "show" | "hide" | "archive" | "restore") => {
    if (!product) return;
    if (dirty) {
      say("error", "Save or undo your changes first.");
      return;
    }
    setBusy(action);
    const result = await adminRequest<{ product: CatalogProduct }>(`/api/admin/products/${product.id}/status`, {
      method: "POST",
      json: { action, expectedUpdatedAt: product.updatedAt },
    });
    setBusy(null);
    if (!result.ok) return say("error", result.message, result.problems);
    setProduct(result.product);
    setForm(toForm(result.product));
    const done = {
      publish: "Published: it's in the shop and for sale.",
      unpublish: "Unpublished: back to draft, hidden from the shop.",
      show: "Shown in the shop as \"price coming soon\" (not for sale).",
      hide: "Hidden from the shop (back to draft).",
      archive: "Archived: hidden from the shop.",
      restore: "Restored as a draft.",
    }[action];
    say("ok", done);
    router.refresh();
  };

  // ---- delete ---------------------------------------------------------------
  const [confirmId, setConfirmId] = useState("");
  const remove = async () => {
    if (!product) return;
    setBusy("delete");
    const result = await adminRequest(`/api/admin/products/${product.id}`, { method: "DELETE", json: { confirmId } });
    setBusy(null);
    if (!result.ok) return say("error", result.message);
    router.replace("/admin");
    router.refresh();
  };

  // ---- images ---------------------------------------------------------------
  const moveImage = (from: number, to: number) =>
    setForm((f) => {
      if (to < 0 || to >= f.images.length) return f;
      const images = [...f.images];
      const [img] = images.splice(from, 1);
      images.splice(to, 0, img!);
      return { ...f, images };
    });
  const updateImage = (i: number, patch: Partial<ProductImage>) =>
    setForm((f) => ({ ...f, images: f.images.map((img, j) => (j === i ? { ...img, ...patch } : img)) }));
  const removeImage = (i: number) => setForm((f) => ({ ...f, images: f.images.filter((_, j) => j !== i) }));
  const addImage = (src: string, view: ImageView) =>
    setForm((f) =>
      f.images.some((img) => img.src === src)
        ? f
        : { ...f, images: [...f.images, { src, view, alt: f.name ? `${f.name}, ${view}` : "" }] },
    );

  const [folderFiles, setFolderFiles] = useState<string[] | null>(null);
  const loadFolder = async () => {
    if (!product) return;
    const result = await adminRequest<{ files: string[] }>(`/api/admin/products/${product.id}/images`);
    if (result.ok) setFolderFiles(result.files);
    else say("error", result.message);
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadView, setUploadView] = useState<ImageView>("front");
  const [uploadFit, setUploadFit] = useState<"pad" | "crop">("pad");
  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!product || !file) return say("error", "Choose an image file first.");
    const body = new FormData();
    body.set("file", file);
    body.set("view", uploadView);
    body.set("fit", uploadFit);
    setBusy("upload");
    const result = await adminRequest<{ src: string }>(`/api/admin/products/${product.id}/images`, { method: "POST", body });
    setBusy(null);
    if (!result.ok) return say("error", result.message);
    addImage(result.src, uploadView);
    if (fileRef.current) fileRef.current.value = "";
    say("ok", "Image uploaded and added to the gallery. Check its alt text, then save.");
  };

  // ---- review notes -----------------------------------------------------------
  const [newNote, setNewNote] = useState("");

  const problems = product ? publishProblems(product) : [];
  const isCreate = !product;
  const err = (k: keyof FieldErrors) =>
    errors[k] ? (
      <p className="admin-error" id={`err-${k}`}>
        {errors[k]}
      </p>
    ) : null;
  const invalid = (k: keyof FieldErrors) => (errors[k] ? { "aria-invalid": true, "aria-describedby": `err-${k}` } : {});

  return (
    <form className="admin-editor" onSubmit={save} noValidate>
      <div className="admin-toolbar">
        <div>
          <p className="admin-crumbs">
            <Link href="/admin">Products</Link> / {isCreate ? "new" : <code>{product.id}</code>}
          </p>
          <h1>{isCreate ? "New product" : product.name}</h1>
        </div>
        <div className="admin-toolbar__actions">
          {!isCreate && (
            <Link href={`/admin/products/${product.id}/preview`} className="admin-btn admin-btn--ghost">
              Preview
            </Link>
          )}
          {dirty && !isCreate && (
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => { setForm(initial); setErrors({}); }}>
              Undo changes
            </button>
          )}
          <button type="submit" className="admin-btn admin-btn--primary" disabled={busy !== null || (!dirty && !isCreate)}>
            {busy === "save" ? "Saving…" : isCreate ? "Create draft" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </div>

      <div ref={messageRef} tabIndex={-1} aria-live="polite" className="admin-message-slot">
        {message && (
          <div className={`admin-message admin-message--${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
            <p>{message.text}</p>
            {message.problems && message.problems.length > 0 && (
              <ul>
                {message.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="admin-editor__grid">
        <div className="admin-editor__col">
          {/* ---- basics ---- */}
          <fieldset className="admin-card">
            <legend>Basics</legend>
            <label className="admin-field">
              <span>Name</span>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} {...invalid("name")} required />
            </label>
            {err("name")}
            {isCreate && <p className="admin-hint">The URL id is made from the name and can&apos;t change later.</p>}
            <div className="admin-field-row">
              <label className="admin-field">
                <span>Category</span>
                <select value={form.category} onChange={(e) => set("category", e.target.value as Category)} {...invalid("category")}>
                  <option value="">Choose…</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span>Subcategory</span>
                <input value={form.subcategory} onChange={(e) => set("subcategory", e.target.value)} list="admin-subcategories" {...invalid("subcategory")} />
                <datalist id="admin-subcategories">
                  {["dehydrated treats", "crunchy dog treats", "meal toppers", "spreads", "dog t-shirts", "needs review"].map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
            </div>
            {err("category")}
            {err("subcategory")}
            <p className="admin-hint">
              Shop filters use the subcategory: dehydrated treats → dehydrated, crunchy dog treats → krunch, meal toppers → meal booster,
              spreads → peanut butter. T-shirts = category &quot;wear &amp; style&quot;, bed = &quot;comfy beds&quot;.
            </p>
            <div className="admin-field-row">
              <label className="admin-field">
                <span>Brand</span>
                <input value={form.brand} onChange={(e) => set("brand", e.target.value)} {...invalid("brand")} />
              </label>
              <label className="admin-field">
                <span>Badge (optional)</span>
                <input value={form.badge} onChange={(e) => set("badge", e.target.value)} placeholder="e.g. new" {...invalid("badge")} />
              </label>
            </div>
            {err("brand")}
            {err("badge")}
            <label className="admin-field">
              <span>Description</span>
              <textarea rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} {...invalid("description")} />
            </label>
            {err("description")}
          </fieldset>

          {/* ---- price & stock ---- */}
          <fieldset className="admin-card">
            <legend>Price &amp; stock</legend>
            {form.variants.length > 0 ? (
              <>
                <p className="admin-hint">
                  Sold by pack size: each pack has its own offer price (what customers pay), optional &quot;was&quot; price and stock.
                  Prices in {STORE_MONEY.currency}.
                </p>
                <div className="admin-packs" role="group" aria-label="Pack sizes">
                  <div className="admin-packs__head" aria-hidden="true">
                    <span>Pack</span>
                    <span>Offer price</span>
                    <span>&quot;Was&quot; price</span>
                    <span>Stock</span>
                    <span />
                  </div>
                  {form.variants.map((v, i) => {
                    const setV = (patch: Partial<FormState["variants"][number]>) =>
                      set("variants", form.variants.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                    return (
                      <div className="admin-packs__row" key={v.id || `new-${i}`}>
                        <label className="admin-field">
                          <span className="admin-packs__label">Pack</span>
                          <input value={v.label} onChange={(e) => setV({ label: e.target.value })} placeholder="e.g. 70 g" aria-label={`Pack ${i + 1} name`} />
                        </label>
                        <label className="admin-field">
                          <span className="admin-packs__label">Offer price</span>
                          <input inputMode="decimal" value={v.price} onChange={(e) => setV({ price: e.target.value })} placeholder="e.g. 310" aria-label={`Pack ${v.label || i + 1} offer price`} />
                        </label>
                        <label className="admin-field">
                          <span className="admin-packs__label">&quot;Was&quot; price</span>
                          <input inputMode="decimal" value={v.compareAt} onChange={(e) => setV({ compareAt: e.target.value })} placeholder="e.g. 340" aria-label={`Pack ${v.label || i + 1} was price`} />
                        </label>
                        <label className="admin-field">
                          <span className="admin-packs__label">Stock</span>
                          <input inputMode="numeric" value={v.stock} onChange={(e) => setV({ stock: e.target.value })} placeholder="e.g. 50" aria-label={`Pack ${v.label || i + 1} stock`} />
                        </label>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          onClick={() => set("variants", form.variants.filter((_, j) => j !== i))}
                          aria-label={`Remove pack ${v.label || i + 1}`}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                </div>
                {err("variants")}
                <button
                  type="button"
                  className="admin-btn admin-btn--sm"
                  onClick={() => set("variants", [...form.variants, { id: "", label: "", price: "", compareAt: "", stock: "" }])}
                >
                  + Add pack size
                </button>
              </>
            ) : (
              <>
            <div className="admin-field-row">
              <label className="admin-field">
                <span>Selling price ({STORE_MONEY.currency})</span>
                <input inputMode="decimal" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="e.g. 12.99" {...invalid("priceCents")} />
              </label>
              <label className="admin-field">
                <span>&quot;Was&quot; price (optional)</span>
                <input inputMode="decimal" value={form.compareAt} onChange={(e) => set("compareAt", e.target.value)} {...invalid("compareAtCents")} />
              </label>
              <label className="admin-field">
                <span>Stock</span>
                <input inputMode="numeric" value={form.stock} onChange={(e) => set("stock", e.target.value)} placeholder="e.g. 20" {...invalid("stock")} />
              </label>
            </div>
            {err("priceCents")}
            {err("compareAtCents")}
            {err("stock")}
            {err("variants")}
            <button
              type="button"
              className="admin-btn admin-btn--sm admin-btn--ghost"
              onClick={() => set("variants", [{ id: "", label: "", price: form.price, compareAt: form.compareAt, stock: form.stock }])}
            >
              Sell in pack sizes instead (e.g. 70 g / 150 g / 300 g)
            </button>
              </>
            )}
            {product?.labelFacts.mrp && (
              <p className="admin-hint admin-hint--label">
                Printed on the pack: <strong>MRP {product.labelFacts.mrp}</strong>
                {product.labelFacts.netWeight && <> · net weight <strong>{product.labelFacts.netWeight}</strong></>}. For reference only;
                it is never used as the selling price.
              </p>
            )}
            {!product?.labelFacts.mrp && product?.labelFacts.netWeight && (
              <p className="admin-hint admin-hint--label">
                Printed on the pack: net weight <strong>{product.labelFacts.netWeight}</strong> (reference only).
              </p>
            )}
            <p className="admin-hint">
              Prices are in {STORE_MONEY.currency}. Currency and delivery charges are set together in <code>lib/store-config.ts</code>.
            </p>
            <label className="admin-check">
              <input type="checkbox" checked={form.featuredToday} onChange={(e) => set("featuredToday", e.target.checked)} />
              Show under the shop&apos;s <strong>today · offer</strong> filter
            </label>
          </fieldset>

          {/* ---- attributes ---- */}
          <fieldset className="admin-card">
            <legend>Details (attributes)</legend>
            <p className="admin-hint">Shown on the product page, e.g. Net weight → 70 g, Size → M. Leave empty if unknown.</p>
            {form.attributes.map((a, i) => (
              <div className="admin-field-row" key={i}>
                <label className="admin-field">
                  <span>Name</span>
                  <input value={a.key} onChange={(e) => set("attributes", form.attributes.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
                </label>
                <label className="admin-field">
                  <span>Value</span>
                  <input value={a.value} onChange={(e) => set("attributes", form.attributes.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                </label>
                <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => set("attributes", form.attributes.filter((_, j) => j !== i))} aria-label={`Remove attribute ${a.key || i + 1}`}>
                  Remove
                </button>
              </div>
            ))}
            {err("attributes")}
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => set("attributes", [...form.attributes, { key: "", value: "" }])}>
              + Add detail
            </button>
          </fieldset>

          {/* ---- label ---- */}
          <fieldset className="admin-card">
            <legend>Printed label text</legend>
            <p className="admin-hint">
              Transcribed from the packaging (ingredients, nutrition, feeding, storage…). Edit carefully: it&apos;s shown on the product page as-is.
            </p>
            <label className="admin-field">
              <span className="visually-hidden">Label text (JSON)</span>
              <textarea rows={12} spellCheck={false} className="admin-code" value={form.labelJson} onChange={(e) => set("labelJson", e.target.value)} {...invalid("label")} />
            </label>
            {err("label")}
          </fieldset>
        </div>

        <div className="admin-editor__col">
          {/* ---- status ---- */}
          {product && (
            <section className="admin-card" aria-labelledby="status-title">
              <h2 id="status-title">Status</h2>
              <p>
                <span className={`admin-chip admin-chip--${product.status}`}>
                  {{ active: "Published", draft: "Draft", coming_soon: "Coming soon", archived: "Archived" }[product.status]}
                </span>{" "}
                {product.status === "active"
                  ? "Visible and for sale in the shop."
                  : product.status === "coming_soon"
                    ? "Visible in the shop as \"price coming soon\". Nobody can buy it yet."
                    : "Hidden from the shop. Nobody can buy it."}
              </p>
              {(product.status === "draft" || product.status === "coming_soon") &&
                (problems.length ? (
                  <>
                    <p className="admin-muted">Before it can be published for sale:</p>
                    <ul className="admin-todo">
                      {problems.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="admin-ok">Ready to publish.</p>
                ))}
              <div className="admin-actions">
                {(product.status === "draft" || product.status === "coming_soon") && (
                  <button type="button" className="admin-btn admin-btn--primary" disabled={busy !== null || problems.length > 0 || dirty} onClick={() => changeStatus("publish")}>
                    {busy === "publish" ? "Publishing…" : "Publish (for sale)"}
                  </button>
                )}
                {product.status === "draft" && (
                  <button type="button" className="admin-btn" disabled={busy !== null || dirty || product.images.length === 0} onClick={() => changeStatus("show")}>
                    {busy === "show" ? "Showing…" : "Show in shop (no price)"}
                  </button>
                )}
                {product.status === "coming_soon" && (
                  <button type="button" className="admin-btn" disabled={busy !== null || dirty} onClick={() => changeStatus("hide")}>
                    {busy === "hide" ? "Hiding…" : "Hide from shop"}
                  </button>
                )}
                {product.status === "active" && (
                  <button type="button" className="admin-btn" disabled={busy !== null || dirty} onClick={() => changeStatus("unpublish")}>
                    {busy === "unpublish" ? "Unpublishing…" : "Unpublish"}
                  </button>
                )}
                {product.status !== "archived" ? (
                  <button type="button" className="admin-btn admin-btn--ghost" disabled={busy !== null || dirty} onClick={() => changeStatus("archive")}>
                    {busy === "archive" ? "Archiving…" : "Archive"}
                  </button>
                ) : (
                  <button type="button" className="admin-btn" disabled={busy !== null || dirty} onClick={() => changeStatus("restore")}>
                    {busy === "restore" ? "Restoring…" : "Restore as draft"}
                  </button>
                )}
              </div>
              {dirty && <p className="admin-hint">Save your changes before changing the status.</p>}
            </section>
          )}

          {/* ---- review notes ---- */}
          <fieldset className="admin-card">
            <legend>Review notes ({form.reviewFlags.length})</legend>
            {form.reviewFlags.length === 0 ? (
              <p className="admin-muted">No open questions.</p>
            ) : (
              <ul className="admin-flags">
                {form.reviewFlags.map((flag, i) => (
                  <li key={`${i}-${flag.slice(0, 20)}`}>
                    <p>{flag}</p>
                    <button type="button" className="admin-btn admin-btn--sm" onClick={() => set("reviewFlags", form.reviewFlags.filter((_, j) => j !== i))}>
                      Mark resolved
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="admin-field-row">
              <label className="admin-field">
                <span>Add a note</span>
                <input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="e.g. confirm the colour name" />
              </label>
              <button
                type="button"
                className="admin-btn admin-btn--sm"
                disabled={!newNote.trim()}
                onClick={() => {
                  set("reviewFlags", [...form.reviewFlags, newNote.trim()]);
                  setNewNote("");
                }}
              >
                Add
              </button>
            </div>
            {err("reviewFlags")}
            <p className="admin-hint">Publishing needs every note resolved. Changes here are saved with &quot;Save changes&quot;.</p>
          </fieldset>

          {/* ---- gallery ---- */}
          <fieldset className="admin-card">
            <legend>Images ({form.images.length})</legend>
            {form.images.length === 0 && <p className="admin-muted">No images yet.</p>}
            <ol className="admin-gallery">
              {form.images.map((img, i) => (
                <li key={img.src} className="admin-gallery__item">
                  <img src={img.src} alt="" width={88} height={88} />
                  <div className="admin-gallery__fields">
                    <p className="admin-gallery__src">
                      {i === 0 && <span className="admin-chip admin-chip--main">main</span>} <code>{img.src.split("/").pop()}</code>
                    </p>
                    <label className="admin-field">
                      <span>Alt text (what the photo shows)</span>
                      <input value={img.alt} onChange={(e) => updateImage(i, { alt: e.target.value })} />
                    </label>
                    <label className="admin-field admin-field--inline">
                      <span>View</span>
                      <select value={img.view} onChange={(e) => updateImage(i, { view: e.target.value as ImageView })}>
                        {IMAGE_VIEWS.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="admin-actions">
                      {i > 0 && (
                        <button type="button" className="admin-btn admin-btn--sm" onClick={() => moveImage(i, 0)}>
                          Make main
                        </button>
                      )}
                      <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" disabled={i === 0} onClick={() => moveImage(i, i - 1)} aria-label={`Move image ${i + 1} up`}>
                        ↑
                      </button>
                      <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" disabled={i === form.images.length - 1} onClick={() => moveImage(i, i + 1)} aria-label={`Move image ${i + 1} down`}>
                        ↓
                      </button>
                      <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={() => removeImage(i)} aria-label={`Remove image ${i + 1} from the gallery`}>
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            {err("images")}
            {product ? (
              <div className="admin-upload">
                <p className="admin-subtitle">Add an image</p>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" aria-label="Image file" />
                <div className="admin-field-row">
                  <label className="admin-field">
                    <span>View</span>
                    <select value={uploadView} onChange={(e) => setUploadView(e.target.value as ImageView)}>
                      {IMAGE_VIEWS.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>Fit</span>
                    <select value={uploadFit} onChange={(e) => setUploadFit(e.target.value as "pad" | "crop")}>
                      <option value="pad">whole photo on white (packshots)</option>
                      <option value="crop">square crop (lifestyle)</option>
                    </select>
                  </label>
                </div>
                <button type="button" className="admin-btn admin-btn--sm" disabled={busy !== null} onClick={upload}>
                  {busy === "upload" ? "Uploading…" : "Upload"}
                </button>
                <p className="admin-hint">JPEG, PNG, WebP or AVIF up to 15 MB. Saved as a 1600×1600 copy; the file you upload isn&apos;t kept.</p>
                <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={loadFolder}>
                  Pick from this product&apos;s folder
                </button>
                {folderFiles && (
                  <ul className="admin-folder">
                    {folderFiles.filter((f) => !form.images.some((img) => img.src === f)).map((f) => (
                      <li key={f}>
                        <img src={f} alt="" width={56} height={56} />
                        <code>{f.split("/").pop()}</code>
                        <button type="button" className="admin-btn admin-btn--sm" onClick={() => addImage(f, "other")}>
                          Add
                        </button>
                      </li>
                    ))}
                    {folderFiles.every((f) => form.images.some((img) => img.src === f)) && <li className="admin-muted">Every file in the folder is already in the gallery.</li>}
                  </ul>
                )}
              </div>
            ) : (
              <p className="admin-hint">Create the draft first, then add images.</p>
            )}
          </fieldset>

          {/* ---- delete ---- */}
          {product && product.status !== "active" && product.status !== "coming_soon" && (
            <section className="admin-card admin-card--danger" aria-labelledby="delete-title">
              <h2 id="delete-title">Delete product</h2>
              <p>
                Removes it from the catalog for good. Image files stay on disk.
                {product.source.kind === "manifest" && " Running the import again would add it back as a draft."} To hide it but keep it, use Archive.
              </p>
              <label className="admin-field">
                <span>
                  Type <code>{product.id}</code> to confirm
                </span>
                <input value={confirmId} onChange={(e) => setConfirmId(e.target.value)} autoComplete="off" />
              </label>
              <button type="button" className="admin-btn admin-btn--danger" disabled={confirmId !== product.id || busy !== null} onClick={remove}>
                {busy === "delete" ? "Deleting…" : "Delete permanently"}
              </button>
            </section>
          )}
          {product && (
            <p className="admin-hint">
              Created {stamp(product.createdAt)} · updated {stamp(product.updatedAt)}
              {product.publishedAt && <> · published {stamp(product.publishedAt)}</>}
              {product.source.files && <> · source: {product.source.files.length} photo{product.source.files.length === 1 ? "" : "s"} in product_list</>}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
