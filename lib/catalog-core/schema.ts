/**
 * The catalog's data model and rules, shared by the admin UI (inline
 * validation), the admin API (the real check) and the CLI.
 *
 * Pure TypeScript with explicit `.ts` imports and no path aliases, so it also
 * runs under plain `node` (see scripts/catalog.ts).
 */
import type { Category, Cents, ImageView, Product, ProductImage, ProductLabel, ProductVariant } from "../types.ts";

export const CATALOG_SCHEMA_VERSION = 1;

/** Shop categories, in display order. The homepage cards (lib/data.js) are separate. */
export const CATEGORIES: readonly Category[] = [
  "food & treats",
  "toys & play",
  "comfy beds",
  "walk & travel",
  "grooming & care",
  "wear & style",
];

export const IMAGE_VIEWS: readonly ImageView[] = ["front", "back", "both", "side", "detail", "lifestyle", "other"];

/**
 * draft: hidden · coming_soon: shown in the shop without a price, not for sale ·
 * active: published and for sale · archived: hidden, kept for later.
 */
export const PRODUCT_STATUSES = ["draft", "coming_soon", "active", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** A pack size. Sold as `${productId}--${id}`. */
export interface CatalogVariant {
  /** Short slug, unique within the product (e.g. "70g"). */
  id: string;
  /** Shown to customers, e.g. "70 g". */
  label: string;
  priceCents: Cents | null;
  compareAtCents: Cents | null;
  stock: number | null;
}

/** Separates product id and pack id in a SKU. Product ids never contain "--". */
export const SKU_SEPARATOR = "--";
export const skuOf = (productId: string, variantId: string) => `${productId}${SKU_SEPARATOR}${variantId}`;

/** "70 g" -> 70, "1.5 kg" -> 1500; anything else -> undefined. */
export function gramsFromLabel(label: string): number | undefined {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(g|gm|gms|grams?|kg)\s*$/i.exec(label);
  if (!m) return undefined;
  const n = Number(m[1]);
  return /^kg$/i.test(m[2]!) ? Math.round(n * 1000) : n;
}

export const variantIdFromLabel = (label: string) => slugify(label).replace(/-/g, "") || "pack";

export interface CatalogProduct {
  /** Stable, never changes after creation (carts and wishlists store it). */
  id: string;
  name: string;
  /** "active" = for sale; "coming_soon" = visible without a price; others hidden. */
  status: ProductStatus;
  category: Category;
  subcategory: string | null;
  brand: string | null;
  description: string;
  /** Selling price. Null until someone enters it; a product can't be published without it. */
  priceCents: Cents | null;
  compareAtCents: Cents | null;
  stock: number | null;
  badge: string | null;
  /** Show under the shop's "today" offers filter. */
  featuredToday: boolean;
  /** Gallery; images[0] is the main image. */
  images: ProductImage[];
  /** Pack sizes. When not empty, they replace the product-level price and stock. */
  variants: CatalogVariant[];
  attributes: Record<string, string>;
  label: ProductLabel | null;
  /** What the pack prints (e.g. MRP). Shown as a hint in the admin, never used as a price. */
  labelFacts: { mrp?: string; netWeight?: string };
  /** Open questions from the import. Publishing requires all of them to be resolved. */
  reviewFlags: string[];
  source: { kind: "manifest" | "legacy-demo" | "admin"; ref?: string; files?: string[] };
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface CatalogFile {
  schemaVersion: number;
  /** Increments on every write; used to reject edits made against a stale copy. */
  revision: number;
  updatedAt: string;
  products: CatalogProduct[];
}

export interface PublicCatalogFile {
  $comment: string;
  revision: number;
  products: Product[];
}

/** Long text only a product's own page needs (kept out of the bundle every page loads). */
export interface PublicDetails {
  description?: string;
  label?: ProductLabel;
  attributes?: Record<string, string>;
}

export interface PublicDetailsFile {
  $comment: string;
  revision: number;
  details: Record<string, PublicDetails>;
}

// ---- limits ---------------------------------------------------------------

export const LIMITS = {
  name: 120,
  short: 60,
  badge: 24,
  description: 4000,
  alt: 200,
  images: 12,
  attributes: 20,
  attrKey: 40,
  attrValue: 200,
  flags: 30,
  flagText: 400,
  labelBytes: 20_000,
  maxPriceCents: 10_000_000,
  maxStock: 100_000,
  variants: 10,
  variantLabel: 30,
} as const;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Images live under public/assets/. No traversal, no odd characters. */
const IMAGE_SRC_RE = /^\/assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:jpe?g|png|webp|avif)$/;

export const isValidId = (id: unknown): id is string => typeof id === "string" && id.length <= 80 && SLUG_RE.test(id);
export const isValidImageSrc = (src: unknown): src is string =>
  typeof src === "string" && src.length <= 300 && IMAGE_SRC_RE.test(src) && !src.includes("..");

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** "12.99" -> 1299. Strict: digits with up to two decimals, no currency signs or commas. */
export function parseMoneyInput(raw: string): Cents | null | "invalid" {
  const s = raw.trim();
  if (s === "") return null;
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(s)) return "invalid";
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export const centsToInput = (cents: Cents | null): string =>
  cents === null ? "" : cents % 100 === 0 ? String(cents / 100) : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;

// ---- validation -----------------------------------------------------------

/** The fields an editor may change. id, status, timestamps and source are managed by the server. */
export interface EditableFields {
  name: string;
  category: Category;
  subcategory: string | null;
  brand: string | null;
  description: string;
  priceCents: Cents | null;
  compareAtCents: Cents | null;
  stock: number | null;
  badge: string | null;
  featuredToday: boolean;
  images: ProductImage[];
  variants: CatalogVariant[];
  attributes: Record<string, string>;
  label: ProductLabel | null;
  reviewFlags: string[];
}

export type FieldErrors = Partial<Record<keyof EditableFields | "form", string>>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const optionalText = (v: unknown, max: number): string | null | undefined => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? null : t.length > max ? undefined : t;
};
const nullableInt = (v: unknown, min: number, max: number): number | null | undefined => {
  if (v === null || v === undefined || v === "") return null;
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined;
};

const LABEL_STRING_KEYS = [
  "tagline", "story", "why", "ingredients", "keyIngredients", "feedingText", "storage",
  "note", "bestBefore", "packedAndMarketedBy", "manufacturedBy", "contact", "dietMark",
] as const;
const LABEL_LIST_KEYS = ["benefits", "features", "badges", "advisory"] as const;

function validateLabel(v: unknown): ProductLabel | null | string {
  if (v === null || v === undefined) return null;
  if (!isRecord(v)) return "Label must be an object.";
  if (JSON.stringify(v).length > LIMITS.labelBytes) return "Label text is too long.";
  const out: ProductLabel = {};
  for (const [key, value] of Object.entries(v)) {
    if ((LABEL_STRING_KEYS as readonly string[]).includes(key)) {
      if (typeof value !== "string") return `Label "${key}" must be text.`;
      if (value.trim()) (out as Record<string, unknown>)[key] = value.trim();
    } else if ((LABEL_LIST_KEYS as readonly string[]).includes(key)) {
      if (!Array.isArray(value) || !value.every((x) => typeof x === "string")) return `Label "${key}" must be a list of text.`;
      const list = value.map((x) => x.trim()).filter(Boolean);
      if (list.length) (out as Record<string, unknown>)[key] = list;
    } else if (key === "nutrition") {
      if (!Array.isArray(value) || !value.every((r) => isRecord(r) && typeof r.label === "string" && typeof r.value === "string"))
        return 'Label "nutrition" must be a list of { label, value }.';
      if (value.length) out.nutrition = value.map((r) => ({ label: String(r.label).trim(), value: String(r.value).trim() }));
    } else if (key === "feeding") {
      if (!Array.isArray(value) || !value.every((r) => isRecord(r) && typeof r.weight === "string" && typeof r.portionPerDay === "string"))
        return 'Label "feeding" must be a list of { weight, portionPerDay }.';
      if (value.length) out.feeding = value.map((r) => ({ weight: String(r.weight).trim(), portionPerDay: String(r.portionPerDay).trim() }));
    } else {
      return `Unknown label field "${key}".`;
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Validates editable fields from an untrusted source (the admin form or API).
 * Returns cleaned values or per-field messages. Never throws.
 */
export function validateEditable(input: unknown): { ok: true; value: EditableFields } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  if (!isRecord(input)) return { ok: false, errors: { form: "Invalid product data." } };

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 2) errors.name = "Enter a product name.";
  else if (name.length > LIMITS.name) errors.name = `Keep the name under ${LIMITS.name} characters.`;

  const category = input.category as Category;
  if (!CATEGORIES.includes(category)) errors.category = "Choose a category.";

  const subcategory = optionalText(input.subcategory, LIMITS.short);
  if (subcategory === undefined) errors.subcategory = `Keep it under ${LIMITS.short} characters.`;
  const brand = optionalText(input.brand, LIMITS.short);
  if (brand === undefined) errors.brand = `Keep it under ${LIMITS.short} characters.`;
  const badge = optionalText(input.badge, LIMITS.badge);
  if (badge === undefined) errors.badge = `Keep the badge under ${LIMITS.badge} characters.`;
  if (input.featuredToday !== undefined && typeof input.featuredToday !== "boolean") errors.form = "Invalid \"today's offer\" value.";
  const featuredToday = input.featuredToday === true;

  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (typeof input.description !== "string" && input.description !== undefined) errors.description = "Description must be text.";
  else if (description.length > LIMITS.description) errors.description = `Keep it under ${LIMITS.description} characters.`;

  const priceCents = nullableInt(input.priceCents, 1, LIMITS.maxPriceCents);
  if (priceCents === undefined) errors.priceCents = "Enter a price like 12.99 (greater than 0).";
  const compareAtCents = nullableInt(input.compareAtCents, 1, LIMITS.maxPriceCents);
  if (compareAtCents === undefined) errors.compareAtCents = "Enter a price like 15.99, or leave it empty.";
  else if (compareAtCents !== null && typeof priceCents === "number" && compareAtCents <= priceCents)
    errors.compareAtCents = "The \"was\" price must be higher than the selling price.";
  const stock = nullableInt(input.stock, 0, LIMITS.maxStock);
  if (stock === undefined) errors.stock = "Stock must be a whole number (0 or more).";

  let images: ProductImage[] = [];
  if (!Array.isArray(input.images)) errors.images = "Images must be a list.";
  else if (input.images.length > LIMITS.images) errors.images = `Up to ${LIMITS.images} images.`;
  else {
    const seen = new Set<string>();
    for (const raw of input.images) {
      if (!isRecord(raw) || !isValidImageSrc(raw.src)) { errors.images = "One of the images has an invalid path."; break; }
      if (seen.has(raw.src)) { errors.images = "The same image is in the gallery twice."; break; }
      seen.add(raw.src);
      const alt = typeof raw.alt === "string" ? raw.alt.trim() : "";
      if (!alt) { errors.images = "Every image needs alt text (what the photo shows)."; break; }
      if (alt.length > LIMITS.alt) { errors.images = `Keep alt text under ${LIMITS.alt} characters.`; break; }
      const view = IMAGE_VIEWS.includes(raw.view as ImageView) ? (raw.view as ImageView) : "other";
      images.push({ src: raw.src, alt, view });
    }
    if (errors.images) images = [];
  }

  const attributes: Record<string, string> = {};
  if (input.attributes !== undefined && !isRecord(input.attributes)) errors.attributes = "Attributes must be name/value pairs.";
  else if (isRecord(input.attributes)) {
    const entries = Object.entries(input.attributes);
    if (entries.length > LIMITS.attributes) errors.attributes = `Up to ${LIMITS.attributes} attributes.`;
    for (const [k, v] of entries) {
      const key = k.trim();
      if (!key || key.length > LIMITS.attrKey || typeof v !== "string" || v.trim().length > LIMITS.attrValue) {
        errors.attributes = `Each attribute needs a name (≤${LIMITS.attrKey}) and a value (≤${LIMITS.attrValue}).`;
        break;
      }
      if (v.trim()) attributes[key] = v.trim();
    }
  }

  const label = validateLabel(input.label);
  if (typeof label === "string") errors.label = label;

  const variants: CatalogVariant[] = [];
  if (input.variants !== undefined && input.variants !== null) {
    if (!Array.isArray(input.variants)) errors.variants = "Pack sizes must be a list.";
    else if (input.variants.length > LIMITS.variants) errors.variants = `Up to ${LIMITS.variants} pack sizes.`;
    else {
      const ids = new Set<string>();
      for (const raw of input.variants) {
        if (!isRecord(raw)) { errors.variants = "Invalid pack size."; break; }
        const label = typeof raw.label === "string" ? raw.label.trim() : "";
        if (!label || label.length > LIMITS.variantLabel) { errors.variants = `Every pack size needs a name like "70 g" (up to ${LIMITS.variantLabel} characters).`; break; }
        const id = typeof raw.id === "string" && raw.id ? raw.id : variantIdFromLabel(label);
        if (!SLUG_RE.test(id) || id.length > 20) { errors.variants = `Pack "${label}" has an invalid id.`; break; }
        if (ids.has(id)) { errors.variants = `Pack size "${label}" is listed twice.`; break; }
        ids.add(id);
        const vPrice = nullableInt(raw.priceCents, 1, LIMITS.maxPriceCents);
        const vWas = nullableInt(raw.compareAtCents, 1, LIMITS.maxPriceCents);
        const vStock = nullableInt(raw.stock, 0, LIMITS.maxStock);
        if (vPrice === undefined) { errors.variants = `Pack "${label}": enter a price like 310 (greater than 0).`; break; }
        if (vWas === undefined) { errors.variants = `Pack "${label}": the "was" price must be a number like 340.`; break; }
        if (vWas !== null && vPrice !== null && vWas <= vPrice) { errors.variants = `Pack "${label}": the "was" price must be higher than the offer price.`; break; }
        if (vStock === undefined) { errors.variants = `Pack "${label}": stock must be a whole number (0 or more).`; break; }
        variants.push({ id, label, priceCents: vPrice, compareAtCents: vWas, stock: vStock });
      }
      if (errors.variants) variants.length = 0;
    }
  }

  let reviewFlags: string[] = [];
  if (input.reviewFlags !== undefined) {
    if (!Array.isArray(input.reviewFlags) || !input.reviewFlags.every((f) => typeof f === "string" && f.length <= LIMITS.flagText))
      errors.reviewFlags = "Review notes must be a list of short texts.";
    else if (input.reviewFlags.length > LIMITS.flags) errors.reviewFlags = `Up to ${LIMITS.flags} review notes.`;
    else reviewFlags = input.reviewFlags.map((f) => f.trim()).filter(Boolean);
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name, category,
      subcategory: subcategory ?? null, brand: brand ?? null, badge: badge ?? null, featuredToday,
      description,
      priceCents: priceCents ?? null, compareAtCents: compareAtCents ?? null, stock: stock ?? null,
      images, variants, attributes, label: typeof label === "string" ? null : label, reviewFlags,
    },
  };
}

/** Why a product can't be published yet (empty = ready). */
export function publishProblems(p: CatalogProduct): string[] {
  const out: string[] = [];
  if (p.variants.length) {
    const missing = p.variants.filter((v) => v.priceCents === null || v.stock === null).map((v) => v.label);
    if (missing.length) out.push(`Set the price and stock for every pack size (missing: ${missing.join(", ")}).`);
  } else {
    if (p.priceCents === null) out.push("Set a selling price.");
    if (p.stock === null) out.push("Set the stock quantity.");
  }
  if (p.images.length === 0) out.push("Add at least one image.");
  if (!p.description.trim()) out.push("Add a description.");
  if (p.reviewFlags.length > 0)
    out.push(`Resolve ${p.reviewFlags.length} review note${p.reviewFlags.length === 1 ? "" : "s"}.`);
  return out;
}

// ---- public view ----------------------------------------------------------

/** Why a product can't be shown as "coming soon" yet (empty = ready). */
export function showcaseProblems(p: CatalogProduct): string[] {
  const out: string[] = [];
  if (p.images.length === 0) out.push("Add at least one image.");
  if (p.name.trim().length < 2) out.push("Add a name.");
  return out;
}

/**
 * The shape the shop sees. Active products are for sale; coming-soon products
 * are shown with price 0, stock 0 and `comingSoon`, so nothing can buy them
 * (the server refuses them too, see lib/server/catalog.ts). Drafts and archived
 * products never leave the server.
 */
export function toPublicProduct(p: CatalogProduct): Product | null {
  if (p.images.length === 0) return null;
  const packs = p.variants ?? [];
  const complete = packs.length
    ? packs.every((v) => v.priceCents !== null && v.stock !== null)
    : p.priceCents !== null && p.stock !== null;
  const forSale = p.status === "active" && complete;
  const comingSoon = p.status === "coming_soon";
  if (!forSale && !comingSoon) return null;

  const variants: ProductVariant[] = forSale
    ? packs.map((v) => {
        const out: ProductVariant = { sku: skuOf(p.id, v.id), label: v.label, priceCents: v.priceCents!, stock: v.stock! };
        if (v.compareAtCents !== null && v.compareAtCents > v.priceCents!) out.compareAtCents = v.compareAtCents;
        const grams = gramsFromLabel(v.label);
        if (grams) out.grams = grams;
        return out;
      })
    : [];
  const cheapest = variants.reduce<ProductVariant | undefined>((min, v) => (!min || v.priceCents < min.priceCents ? v : min), undefined);

  const out: Product = {
    id: p.id,
    name: p.name,
    priceCents: !forSale ? 0 : cheapest ? cheapest.priceCents : p.priceCents!,
    category: p.category,
    img: p.images[0]!.src,
    stock: !forSale ? 0 : variants.length ? variants.reduce((sum, v) => sum + v.stock, 0) : p.stock!,
    images: p.images,
    createdAt: p.createdAt,
  };
  if (variants.length) {
    out.variants = variants;
    if (cheapest?.compareAtCents) out.compareAtCents = cheapest.compareAtCents;
  }
  if (comingSoon) out.comingSoon = true;
  if (p.badge) out.badge = p.badge;
  if (p.featuredToday) out.featuredToday = true;
  if (p.subcategory) out.subcategory = p.subcategory;
  if (p.brand) out.brand = p.brand;
  if (p.description) out.description = p.description;
  if (forSale && !variants.length && p.compareAtCents !== null && p.compareAtCents > p.priceCents!) out.compareAtCents = p.compareAtCents;
  if (Object.keys(p.attributes).length) out.attributes = p.attributes;
  if (p.label) out.label = p.label;
  return out;
}

/**
 * Splits a public product into the card (what the shop grid, cart and wishlist
 * need on every page) and its details (description, printed label, attributes:
 * only the product page needs them). The card keeps the short "With oats, ..."
 * line so search can still match key ingredients.
 */
export function splitPublicProduct(p: Product): { card: Product; details: PublicDetails } {
  const { description, label, attributes, ...rest } = p;
  const card: Product = rest;
  const details: PublicDetails = {};
  if (description) details.description = description;
  if (label) details.label = label;
  if (attributes) details.attributes = attributes;
  if (label?.keyIngredients) card.label = { keyIngredients: label.keyIngredients };
  return { card, details };
}

const GENERATED = "GENERATED from data/catalog.json. Do not edit by hand: use the admin or `npm run catalog -- sync-public`.";

const publicProducts = (file: CatalogFile) => file.products.map(toPublicProduct).filter((p): p is Product => p !== null);

export function toPublicCatalog(file: CatalogFile): PublicCatalogFile {
  return { $comment: GENERATED, revision: file.revision, products: publicProducts(file).map((p) => splitPublicProduct(p).card) };
}

export function toPublicDetails(file: CatalogFile): PublicDetailsFile {
  const details: Record<string, PublicDetails> = {};
  for (const p of publicProducts(file)) {
    const d = splitPublicProduct(p).details;
    if (Object.keys(d).length) details[p.id] = d;
  }
  return { $comment: GENERATED, revision: file.revision, details };
}

/**
 * The same product as the shop would show it, for admin previews of drafts.
 * Price/stock fall back to 0 so the layout renders; previews never allow buying.
 */
export function toPreviewProduct(p: CatalogProduct): Product {
  const images: ProductImage[] = p.images.length ? p.images : [{ src: PLACEHOLDER_IMAGE, alt: "", view: "other" }];
  const variants = (p.variants ?? []).map((v) => ({ ...v, priceCents: v.priceCents ?? 0, stock: v.stock ?? 0 }));
  return toPublicProduct({ ...p, status: "active", priceCents: p.priceCents ?? 0, stock: p.stock ?? 0, images, variants })!;
}

/** Shown in previews for a product that has no image yet. */
export const PLACEHOLDER_IMAGE = "/assets/pets/paw-sticker.svg";

/** Light structural check of a catalog file read from disk. */
export function assertCatalogFile(value: unknown): CatalogFile {
  if (!isRecord(value) || typeof value.revision !== "number" || !Array.isArray(value.products))
    throw new Error("data/catalog.json is not a valid catalog file.");
  if (value.schemaVersion !== CATALOG_SCHEMA_VERSION)
    throw new Error(`Unsupported catalog schemaVersion ${String(value.schemaVersion)}.`);
  const ids = new Set<string>();
  for (const p of value.products as CatalogProduct[]) {
    if (!isValidId(p.id)) throw new Error(`Invalid product id in catalog: ${String(p.id)}`);
    if (ids.has(p.id)) throw new Error(`Duplicate product id in catalog: ${p.id}`);
    if (!PRODUCT_STATUSES.includes(p.status)) throw new Error(`Invalid status for ${p.id}: ${String(p.status)}`);
    // Older catalog files predate pack sizes.
    if (!Array.isArray(p.variants)) p.variants = [];
    ids.add(p.id);
  }
  return value as unknown as CatalogFile;
}
