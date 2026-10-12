/**
 * Manifest -> draft products (data/import/product-list.manifest.json).
 *
 * Two steps, so nothing is saved without a preview:
 *   planImport()  -> what would be created, skipped or rejected, and why
 *   applyImport() -> saves only the approved, still-new products as drafts
 *
 * Safe to rerun: a product whose id already exists in the catalog (any status)
 * is skipped, never overwritten.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Category, ImageView, ProductImage, ProductLabel } from "../types.ts";
import type { AssetStore, CatalogStore } from "./file-store.ts";
import { validateEditable, type CatalogFile, type CatalogProduct } from "./schema.ts";

// ---- manifest shape (see the JSON file) ------------------------------------

interface ManifestImage { file: string; view: ImageView; fit: string; alt: string }
interface ManifestLabel {
  why?: string; ingredients?: string; frontKeyIngredients?: string;
  nutrition?: Record<string, string>;
  feeding?: { weight: string; portionPerDay: string }[];
  feedingText?: string; benefits?: string[]; features?: string[];
  storage?: string; advisory?: string[]; note?: string; bestBefore?: string;
  packedAndMarketedBy?: string; manufacturedBy?: string; contact?: string; dietMark?: string;
  labelMrp?: string; labelNetWeight?: string;
}
interface ManifestLine extends ManifestLabel {
  name: string; tagline?: string; story?: string; frontBadges?: string[]; flags?: string[];
}
interface ManifestProduct {
  id: string; name: string; line: string | null; category: Category; subcategory: string | null;
  images: ManifestImage[]; label: ManifestLabel; flags: string[];
}
export interface Manifest {
  version: number; sourceRoot: string; outputRoot: string; brand: string;
  lines: Record<string, ManifestLine>; products: ManifestProduct[];
}

export const MANIFEST_PATH = path.join("data", "import", "product-list.manifest.json");

export async function readManifest(root: string): Promise<Manifest> {
  return JSON.parse(await readFile(path.join(root, MANIFEST_PATH), "utf8")) as Manifest;
}

// ---- plan ------------------------------------------------------------------

export type PlanStatus = "new" | "exists" | "invalid";

export interface PlanItem {
  id: string;
  name: string;
  category: Category;
  subcategory: string | null;
  status: PlanStatus;
  /** Why it is skipped or rejected. */
  problems: string[];
  images: ProductImage[];
  reviewFlags: string[];
  labelFacts: CatalogProduct["labelFacts"];
  /** The draft that would be saved (only for status "new"). */
  product?: CatalogProduct;
}

export interface ImportPlan {
  manifestVersion: number;
  items: PlanItem[];
  counts: Record<PlanStatus, number>;
}

function buildLabel(line: ManifestLine | undefined, own: ManifestLabel): ProductLabel | null {
  const pick = <K extends keyof ManifestLabel>(k: K) => own[k] ?? line?.[k];
  const nutrition = own.nutrition ?? line?.nutrition;
  const label: ProductLabel = {
    tagline: line?.tagline,
    story: line?.story,
    why: own.why,
    ingredients: pick("ingredients"),
    keyIngredients: pick("frontKeyIngredients"),
    nutrition: nutrition ? Object.entries(nutrition).map(([l, value]) => ({ label: l, value })) : undefined,
    feeding: pick("feeding"),
    feedingText: pick("feedingText"),
    benefits: pick("benefits"),
    features: pick("features"),
    badges: line?.frontBadges,
    storage: pick("storage"),
    advisory: pick("advisory"),
    note: pick("note"),
    bestBefore: pick("bestBefore"),
    packedAndMarketedBy: pick("packedAndMarketedBy"),
    manufacturedBy: pick("manufacturedBy"),
    contact: pick("contact"),
    dietMark: pick("dietMark"),
  };
  for (const k of Object.keys(label) as (keyof ProductLabel)[]) if (label[k] === undefined) delete label[k];
  return Object.keys(label).length ? label : null;
}

export async function planImport(opts: {
  manifest: Manifest;
  catalog: CatalogFile;
  assets: Pick<AssetStore, "exists">;
  now?: Date;
}): Promise<ImportPlan> {
  const { manifest, catalog, assets } = opts;
  const now = (opts.now ?? new Date()).toISOString();
  const existing = new Set(catalog.products.map((p) => p.id));
  const seen = new Set<string>();
  const items: PlanItem[] = [];

  for (const mp of manifest.products) {
    const line = mp.line ? manifest.lines[mp.line] : undefined;
    const problems: string[] = [];
    if (mp.line && !line) problems.push(`Unknown product line "${mp.line}" in the manifest.`);
    if (seen.has(mp.id)) problems.push("Listed twice in the manifest.");
    seen.add(mp.id);

    const outputRoot = manifest.outputRoot.replace(/^public/, "");
    const images: ProductImage[] = mp.images.map((img) => ({
      src: `${outputRoot}/${mp.id}/${img.view}.jpg`,
      alt: img.alt,
      view: img.view,
    }));
    for (const img of images)
      if (!(await assets.exists(img.src)))
        problems.push(`Optimized image missing: ${img.src} (run \`npm run catalog:images\`).`);

    const reviewFlags = [...(line?.flags ?? []), ...mp.flags];
    const labelFacts: CatalogProduct["labelFacts"] = {};
    const mrp = mp.label.labelMrp ?? line?.labelMrp;
    const netWeight = mp.label.labelNetWeight ?? line?.labelNetWeight;
    if (mrp) labelFacts.mrp = mrp;
    if (netWeight) labelFacts.netWeight = netWeight;

    const label = buildLabel(line, mp.label);
    const editable = validateEditable({
      name: mp.name,
      category: mp.category,
      subcategory: mp.subcategory,
      // Packaged food carries the brand on the label; apparel and the bed don't say.
      brand: mp.category === "food & treats" ? manifest.brand : null,
      // Only text printed on the pack. Empty is fine: publishing asks for one.
      description: mp.label.why ?? line?.story ?? "",
      priceCents: null,
      compareAtCents: null,
      stock: null,
      badge: null,
      featuredToday: false,
      images,
      variants: [],
      attributes: {},
      label,
      reviewFlags,
    });
    if (!editable.ok) problems.push(...Object.entries(editable.errors).map(([f, m]) => `${f}: ${m}`));

    let status: PlanStatus = problems.length ? "invalid" : "new";
    if (existing.has(mp.id)) {
      status = "exists";
      problems.unshift("Already in the catalog: skipped (existing products are never overwritten).");
    }

    const item: PlanItem = {
      id: mp.id, name: mp.name, category: mp.category, subcategory: mp.subcategory,
      status, problems, images, reviewFlags, labelFacts,
    };
    if (status === "new" && editable.ok) {
      item.product = {
        id: mp.id,
        status: "draft",
        ...editable.value,
        labelFacts,
        source: {
          kind: "manifest",
          ref: `${MANIFEST_PATH.split(path.sep).join("/")} v${manifest.version}`,
          files: mp.images.map((i) => `${manifest.sourceRoot}/${i.file}`),
        },
        createdAt: now,
        updatedAt: now,
        publishedAt: null,
      };
    }
    items.push(item);
  }

  const counts = { new: 0, exists: 0, invalid: 0 } as Record<PlanStatus, number>;
  for (const i of items) counts[i.status] += 1;
  return { manifestVersion: manifest.version, items, counts };
}

// ---- apply -----------------------------------------------------------------

export interface ImportReport {
  imported: string[];
  skippedExisting: string[];
  skippedNotApproved: string[];
  failed: { id: string; problems: string[] }[];
  revision: number;
}

/** Saves approved "new" items as drafts. `approvedIds` = null approves every new item. */
export async function applyImport(store: CatalogStore, plan: ImportPlan, approvedIds: readonly string[] | null): Promise<ImportReport> {
  const approved = approvedIds ? new Set(approvedIds) : null;
  const report: ImportReport = { imported: [], skippedExisting: [], skippedNotApproved: [], failed: [], revision: 0 };

  const wanted = plan.items.some((i) => i.status === "new" && (!approved || approved.has(i.id)));
  if (!wanted) {
    // Nothing to save: report without touching the file (and without bumping its revision).
    for (const item of plan.items) {
      if (item.status === "invalid") report.failed.push({ id: item.id, problems: item.problems });
      else if (item.status === "exists") report.skippedExisting.push(item.id);
      else report.skippedNotApproved.push(item.id);
    }
    report.revision = (await store.read()).revision;
    return report;
  }

  const next = await store.update(null, (draft) => {
    const ids = new Set(draft.products.map((p) => p.id));
    for (const item of plan.items) {
      if (item.status === "invalid") { report.failed.push({ id: item.id, problems: item.problems }); continue; }
      // Re-checked against the latest catalog inside the lock: two imports can't both add it.
      if (item.status === "exists" || ids.has(item.id)) { report.skippedExisting.push(item.id); continue; }
      if (approved && !approved.has(item.id)) { report.skippedNotApproved.push(item.id); continue; }
      draft.products.push(item.product!);
      ids.add(item.id);
      report.imported.push(item.id);
    }
  });
  report.revision = next.revision;
  return report;
}
