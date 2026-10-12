/**
 * Price sheets: set prices, pack sizes and stock for many products at once,
 * from an Excel file (.xlsx) or a CSV.
 *
 *   template -> data/import/prices-template.csv (one row per product / pack size)
 *   plan     -> validated changes + per-row problems (nothing saved)
 *   apply    -> writes prices / packs / stock; never publishes unless asked
 *
 * Accepted headings (case-insensitive, "(₹)" ignored):
 *   product:  id | sku   or   name | product name | product
 *   pack:     pack | pack size | size | variant          (optional: one row per pack size)
 *   price:    offer price | selling price | price         (what customers pay)
 *   was:      was price | was_price | mrp | price         ("price" means "was" when an offer price column exists)
 *   stock:    stock | qty | quantity                      (optional; see `defaultStock`)
 *   weight:   net weight | net_weight                     (optional)
 *
 * Plain Node, like the rest of catalog-core.
 */
import type { CatalogStore } from "./file-store.ts";
import {
  parseMoneyInput,
  publishProblems,
  variantIdFromLabel,
  type CatalogFile,
  type CatalogProduct,
  type CatalogVariant,
} from "./schema.ts";

export const PRICE_COLUMNS = ["id", "name", "pack", "label_mrp", "label_net_weight", "price", "was_price", "stock", "net_weight"] as const;

const BOM = "﻿";
const csvCell = (v: string) => (/[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const money = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(/\.00$/, ""));

export function buildPriceTemplate(file: CatalogFile, ids?: readonly string[]): string {
  const wanted = ids ? new Set(ids) : null;
  const rows: string[] = [];
  for (const p of file.products) {
    if (wanted ? !wanted.has(p.id) : p.status === "archived") continue;
    const base = [p.id, p.name];
    const facts = [p.labelFacts.mrp ?? "", p.labelFacts.netWeight ?? ""];
    if (p.variants.length)
      for (const v of p.variants)
        rows.push([...base, v.label, ...facts, money(v.priceCents), money(v.compareAtCents), v.stock === null ? "" : String(v.stock), ""].map(csvCell).join(","));
    else
      rows.push(
        [...base, "", ...facts, money(p.priceCents), money(p.compareAtCents), p.stock === null ? "" : String(p.stock), p.attributes["Net weight"] ?? ""]
          .map(csvCell)
          .join(","),
      );
  }
  // BOM so Excel opens the ₹ signs and dashes correctly.
  return BOM + [PRICE_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, newlines in quotes). Detects , or ; from the header. */
export function parseCsv(text: string): string[][] {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** "₹1,299.00", "1299", " 349 " -> cents. Currency signs and thousands commas are ignored. */
function sheetMoney(raw: string): number | null | "invalid" {
  let cleaned = raw.replace(/[₹$\s]/g, "").replace(/^Rs\.?/i, "");
  // Thousands separators only: "1,299", "1,299.00", "1,23,456.00". A lone decimal comma ("12,99") stays and is rejected.
  if (/^\d{1,3}(?:,\d{2})*,\d{3}(?:\.\d{1,2})?$/.test(cleaned)) cleaned = cleaned.replace(/,/g, "");
  return parseMoneyInput(cleaned);
}

const normHeader = (h: string) =>
  h.toLowerCase().replace(/\(.*?\)/g, "").replace(/[₹_]/g, " ").replace(/\s+/g, " ").trim();
const normName = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const normPack = (s: string) => s.toLowerCase().replace(/\s+/g, "");
/** "N/A", "NA", "-", "none", "not specified" in the pack column mean: no pack size (single price). */
const NO_PACK = /^(?:n\/?a|-+|—|none|not specified|not applicable|single|one size)$/i;

export interface PriceRowChange {
  productId: string;
  name: string;
  /** Pack size label for pack rows; null for a product without packs. */
  pack: string | null;
  priceCents: number | null;
  compareAtCents: number | null;
  stock: number | null;
  /** True when stock came from `defaultStock`, not the sheet. */
  stockFromDefault: boolean;
  netWeight: string | null;
}

export interface PriceSheetPlan {
  changes: PriceRowChange[];
  problems: { row: number; id: string; message: string }[];
  /** Rows that leave every value empty: nothing to change. */
  emptyRows: number;
}

export interface PlanOptions {
  /** Stock to use for rows without a stock value, for packs/products that have no stock yet. */
  defaultStock?: number;
}

export function planPriceSheet(input: string | string[][], catalog: CatalogFile, opts: PlanOptions = {}): PriceSheetPlan {
  const rows = typeof input === "string" ? parseCsv(input) : input.map((r) => [...r]);
  const plan: PriceSheetPlan = { changes: [], problems: [], emptyRows: 0 };
  const header = (rows.shift() ?? []).map(normHeader);
  const find = (...names: string[]) => names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1;

  const colId = find("id", "sku");
  const colName = find("name", "product name", "product");
  const colPack = find("pack", "pack size", "size", "variant");
  const colOffer = find("offer price", "selling price");
  const colPrice = colOffer >= 0 ? colOffer : find("price");
  const colWas = colOffer >= 0 ? find("was price", "mrp", "price") : find("was price", "mrp");
  const colStock = find("stock", "qty", "quantity");
  const colWeight = find("net weight");

  if (colId < 0 && colName < 0) plan.problems.push({ row: 1, id: "", message: 'Missing a product column ("id" or "Product Name").' });
  if (colPrice < 0) plan.problems.push({ row: 1, id: "", message: 'Missing a price column ("price" or "Offer Price").' });
  if (plan.problems.length) return plan;

  const byId = new Map(catalog.products.map((p) => [p.id, p]));
  const byName = new Map<string, CatalogProduct[]>();
  for (const p of catalog.products) {
    if (p.status === "archived") continue;
    const k = normName(p.name);
    byName.set(k, [...(byName.get(k) ?? []), p]);
  }
  const seen = new Set<string>();

  rows.forEach((cells, i) => {
    const rowNo = i + 2;
    const get = (col: number) => (col >= 0 ? (cells[col] ?? "").trim() : "");
    const idText = get(colId);
    const nameText = get(colName);
    let product: CatalogProduct | undefined;
    if (idText) product = byId.get(idText);
    else if (nameText) {
      const matches = byName.get(normName(nameText)) ?? [];
      if (matches.length > 1) return plan.problems.push({ row: rowNo, id: nameText, message: "More than one product has this name; use the id column." });
      product = matches[0];
    }
    const label = idText || nameText;
    if (!product) return plan.problems.push({ row: rowNo, id: label, message: "No product with this id/name (check spelling, or use the id column)." });

    const packText = get(colPack);
    const pack = packText && !NO_PACK.test(packText) ? packText : null;
    if (!pack && product.variants.length)
      return plan.problems.push({ row: rowNo, id: product.id, message: "This product has pack sizes: give the pack size on each row." });
    const key = `${product.id}|${pack ? normPack(pack) : ""}`;
    if (seen.has(key)) return plan.problems.push({ row: rowNo, id: product.id, message: `This ${pack ? `pack (${pack})` : "product"} appears twice in the sheet.` });
    seen.add(key);

    const price = sheetMoney(get(colPrice));
    const was = sheetMoney(get(colWas));
    const stockText = get(colStock);
    const stockParsed = stockText === "" ? null : /^\d+$/.test(stockText) ? Number(stockText) : NaN;
    const netWeight = get(colWeight) || null;
    const bad: string[] = [];
    if (price === "invalid" || price === 0) bad.push(`price "${get(colPrice)}" isn't a valid amount`);
    if (was === "invalid") bad.push(`was price "${get(colWas)}" isn't a valid amount`);
    if (typeof was === "number" && typeof price === "number" && was <= price) bad.push("the was price must be higher than the offer price");
    if (Number.isNaN(stockParsed)) bad.push(`stock "${stockText}" must be a whole number`);
    if (pack && pack.length > 30) bad.push("pack size is too long");
    if (netWeight && netWeight.length > 200) bad.push("net weight is too long");
    if (bad.length) return plan.problems.push({ row: rowNo, id: product.id, message: bad.join("; ") });

    // Default stock only fills a gap: never overrides stock that already exists.
    const existing = pack ? product.variants.find((v) => normPack(v.label) === normPack(pack)) : undefined;
    const currentStock = pack ? existing?.stock ?? null : product.stock;
    let stock = typeof stockParsed === "number" ? stockParsed : null;
    let stockFromDefault = false;
    if (stock === null && currentStock === null && opts.defaultStock !== undefined) {
      stock = opts.defaultStock;
      stockFromDefault = true;
    }

    if (price === null && was === null && stock === null && !netWeight && !pack) { plan.emptyRows += 1; return; }
    plan.changes.push({
      productId: product.id,
      name: product.name,
      pack,
      priceCents: typeof price === "number" ? price : null,
      compareAtCents: typeof was === "number" ? was : null,
      stock,
      stockFromDefault,
      netWeight,
    });
  });
  return plan;
}

export interface PriceSheetReport {
  updated: string[];
  /** Pack sizes created by the sheet, as "product-id: label". */
  packsAdded: string[];
  published: string[];
  /** Asked to publish but not ready (e.g. open review notes). */
  notPublished: { id: string; problems: string[] }[];
  revision: number;
}

/** Empty cells leave the current value as it is. `publish` also publishes products that are complete. */
export async function applyPriceSheet(store: CatalogStore, plan: PriceSheetPlan, opts: { publish: boolean; now?: Date }): Promise<PriceSheetReport> {
  const report: PriceSheetReport = { updated: [], packsAdded: [], published: [], notPublished: [], revision: 0 };
  if (plan.problems.length) throw new Error("Fix the problems in the sheet first; nothing was saved.");
  const stamp = (opts.now ?? new Date()).toISOString();
  const next = await store.update(null, (draft) => {
    const touched = new Set<string>();
    for (const change of plan.changes) {
      const i = draft.products.findIndex((p) => p.id === change.productId);
      if (i < 0) continue;
      const p: CatalogProduct = { ...draft.products[i]!, variants: [...(draft.products[i]!.variants ?? [])], updatedAt: stamp };
      if (change.pack) {
        const at = p.variants.findIndex((v) => normPack(v.label) === normPack(change.pack!));
        const before: CatalogVariant =
          at >= 0 ? p.variants[at]! : { id: variantIdFromLabel(change.pack), label: change.pack, priceCents: null, compareAtCents: null, stock: null };
        const v: CatalogVariant = {
          ...before,
          priceCents: change.priceCents ?? before.priceCents,
          compareAtCents: change.compareAtCents ?? before.compareAtCents,
          stock: change.stock ?? before.stock,
        };
        if (v.compareAtCents !== null && v.priceCents !== null && v.compareAtCents <= v.priceCents) v.compareAtCents = null;
        if (at >= 0) p.variants[at] = v;
        else {
          // Keep ids unique even if two labels slug the same way ("70g" / "70 g").
          let id = v.id;
          for (let n = 2; p.variants.some((x) => x.id === id); n++) id = `${v.id}${n}`;
          p.variants.push({ ...v, id });
          report.packsAdded.push(`${p.id}: ${v.label}`);
        }
      } else {
        p.priceCents = change.priceCents ?? p.priceCents;
        p.compareAtCents = change.compareAtCents ?? p.compareAtCents;
        p.stock = change.stock ?? p.stock;
        if (p.compareAtCents !== null && p.priceCents !== null && p.compareAtCents <= p.priceCents) p.compareAtCents = null;
      }
      if (change.netWeight) p.attributes = { ...p.attributes, "Net weight": change.netWeight };
      draft.products[i] = p;
      touched.add(p.id);
    }
    for (const id of touched) {
      const i = draft.products.findIndex((p) => p.id === id);
      const p = draft.products[i]!;
      report.updated.push(id);
      if (opts.publish && p.status !== "active" && p.status !== "archived") {
        const problems = publishProblems(p);
        if (problems.length) report.notPublished.push({ id, problems });
        else {
          draft.products[i] = { ...p, status: "active", publishedAt: stamp };
          report.published.push(id);
        }
      }
    }
  });
  report.revision = next.revision;
  return report;
}
