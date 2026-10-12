/**
 * Admin operations on the catalog: create, edit, publish/unpublish/archive/
 * restore, delete. Every rule is enforced here, on the server; the admin UI
 * only mirrors them for friendlier messages.
 *
 * Concurrency: each edit carries the product's `updatedAt` as the client saw
 * it. If the product changed since, the edit is rejected (409) instead of
 * silently overwriting someone else's change.
 */
import type { AssetStore, CatalogStore } from "./file-store.ts";
import { RevisionConflictError } from "./file-store.ts";
import {
  publishProblems,
  showcaseProblems,
  slugify,
  validateEditable,
  type CatalogProduct,
  type FieldErrors,
  type ProductStatus,
} from "./schema.ts";

export type OpResult =
  | { ok: true; product: CatalogProduct; revision: number }
  | { ok: false; status: number; code: string; message: string; errors?: FieldErrors; problems?: string[] };

const fail = (status: number, code: string, message: string, extra: Partial<Extract<OpResult, { ok: false }>> = {}): OpResult => ({
  ok: false, status, code, message, ...extra,
});

class OpError extends Error {
  readonly result: OpResult;
  constructor(result: OpResult) {
    super(result.ok ? "ok" : result.message);
    this.result = result;
  }
}

async function missingImages(assets: Pick<AssetStore, "exists">, images: CatalogProduct["images"]): Promise<string[]> {
  const missing: string[] = [];
  for (const img of images) if (!(await assets.exists(img.src))) missing.push(img.src);
  return missing;
}

async function run(store: CatalogStore, fn: (products: CatalogProduct[]) => CatalogProduct): Promise<OpResult> {
  let saved: CatalogProduct | undefined;
  try {
    const file = await store.update(null, (draft) => {
      saved = fn(draft.products);
    });
    return { ok: true, product: saved!, revision: file.revision };
  } catch (err) {
    if (err instanceof OpError) return err.result;
    if (err instanceof RevisionConflictError) return fail(409, "conflict", err.message);
    throw err;
  }
}

export async function createProduct(store: CatalogStore, assets: Pick<AssetStore, "exists">, input: unknown, now = new Date()): Promise<OpResult> {
  const parsed = validateEditable(input);
  if (!parsed.ok) return fail(422, "validation", "Please fix the highlighted fields.", { errors: parsed.errors });
  const missing = await missingImages(assets, parsed.value.images);
  if (missing.length) return fail(422, "validation", "Some images were not found.", { errors: { images: `Not found: ${missing.join(", ")}` } });

  const stamp = now.toISOString();
  return run(store, (products) => {
    const base = slugify(parsed.value.name) || "product";
    const taken = new Set(products.map((p) => p.id));
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
    const product: CatalogProduct = {
      id,
      status: "draft",
      ...parsed.value,
      labelFacts: {},
      source: { kind: "admin" },
      createdAt: stamp,
      updatedAt: stamp,
      publishedAt: null,
    };
    products.push(product);
    return product;
  });
}

export async function updateProduct(
  store: CatalogStore,
  assets: Pick<AssetStore, "exists">,
  id: string,
  expectedUpdatedAt: unknown,
  input: unknown,
  now = new Date(),
): Promise<OpResult> {
  const parsed = validateEditable(input);
  if (!parsed.ok) return fail(422, "validation", "Please fix the highlighted fields.", { errors: parsed.errors });
  const missing = await missingImages(assets, parsed.value.images);
  if (missing.length) return fail(422, "validation", "Some images were not found.", { errors: { images: `Not found: ${missing.join(", ")}` } });

  return run(store, (products) => {
    const current = products.find((p) => p.id === id);
    if (!current) throw new OpError(fail(404, "not_found", "That product doesn't exist (it may have been deleted)."));
    if (current.updatedAt !== expectedUpdatedAt)
      throw new OpError(fail(409, "conflict", "This product was changed somewhere else since you opened it. Reload to see the latest version, then redo your edit."));
    const next: CatalogProduct = { ...current, ...parsed.value, updatedAt: now.toISOString() };
    // A live product must stay sellable: unpublish first to blank out its price, stock, etc.
    if (current.status === "active") {
      const problems = publishProblems(next);
      if (problems.length)
        throw new OpError(fail(422, "would_break_live", "This product is live, so it can't be saved without these. Unpublish it first to make that change.", { problems }));
    }
    products[products.indexOf(current)] = next;
    return next;
  });
}

export type StatusAction = "publish" | "unpublish" | "show" | "hide" | "archive" | "restore";
const TRANSITIONS: Record<StatusAction, { from: ProductStatus[]; to: ProductStatus }> = {
  publish: { from: ["draft", "coming_soon"], to: "active" },
  unpublish: { from: ["active"], to: "draft" },
  /** Show in the shop without a price (not for sale). */
  show: { from: ["draft"], to: "coming_soon" },
  hide: { from: ["coming_soon"], to: "draft" },
  archive: { from: ["draft", "coming_soon", "active"], to: "archived" },
  restore: { from: ["archived"], to: "draft" },
};

export async function changeStatus(store: CatalogStore, id: string, expectedUpdatedAt: unknown, action: unknown, now = new Date()): Promise<OpResult> {
  if (typeof action !== "string" || !(action in TRANSITIONS)) return fail(400, "invalid_request", "Unknown action.");
  const rule = TRANSITIONS[action as StatusAction];
  return run(store, (products) => {
    const current = products.find((p) => p.id === id);
    if (!current) throw new OpError(fail(404, "not_found", "That product doesn't exist."));
    if (current.updatedAt !== expectedUpdatedAt)
      throw new OpError(fail(409, "conflict", "This product was changed somewhere else. Reload and try again."));
    if (!rule.from.includes(current.status))
      throw new OpError(fail(409, "invalid_transition", `Can't ${action} a product that is ${current.status === "active" ? "published" : current.status.replace("_", " ")}.`));
    if (action === "publish") {
      const problems = publishProblems(current);
      if (problems.length) throw new OpError(fail(422, "not_ready", "This product isn't ready to publish yet.", { problems }));
    }
    if (action === "show") {
      const problems = showcaseProblems(current);
      if (problems.length) throw new OpError(fail(422, "not_ready", "This product can't be shown yet.", { problems }));
    }
    const stamp = now.toISOString();
    const next: CatalogProduct = {
      ...current,
      status: rule.to,
      updatedAt: stamp,
      publishedAt: action === "publish" ? stamp : current.publishedAt,
    };
    products[products.indexOf(current)] = next;
    return next;
  });
}

/** Deletes a draft or archived product (never a live one). Image files are kept on disk. */
export async function deleteProduct(store: CatalogStore, id: string, confirmId: unknown): Promise<OpResult> {
  if (confirmId !== id) return fail(400, "confirm_required", "Type the product id exactly to confirm deleting it.");
  return run(store, (products) => {
    const current = products.find((p) => p.id === id);
    if (!current) throw new OpError(fail(404, "not_found", "That product doesn't exist."));
    if (current.status === "active" || current.status === "coming_soon")
      throw new OpError(fail(409, "is_live", "This product is visible in the shop. Hide, unpublish or archive it before deleting."));
    products.splice(products.indexOf(current), 1);
    return current;
  });
}
