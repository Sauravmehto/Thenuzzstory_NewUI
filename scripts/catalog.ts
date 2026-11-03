#!/usr/bin/env node
/**
 * Catalog maintenance (runs with plain Node 22.18+/24, no build step):
 *
 *   npm run catalog -- status
 *   npm run catalog -- init                      one-time: create data/catalog.json, demo products archived
 *   npm run catalog -- import                    preview the manifest import (writes nothing)
 *   npm run catalog -- import --apply            save every new product as a DRAFT
 *   npm run catalog -- import --apply --only a,b save only these ids
 *   npm run catalog -- sync-public [--check]     rebuild (or verify) data/catalog.public.json
 *   npm run catalog -- show-coming-soon          show every draft (with images) in the shop as "price coming soon"
 *   npm run catalog -- prices-template           write data/import/prices-template.csv (open in Excel)
 *   npm run catalog -- prices <file.xlsx|csv> [--stock 50]   preview prices / pack sizes / stock (writes nothing)
 *   npm run catalog -- prices <file.xlsx|csv> --apply [--publish]
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFileAssetStore, createFileCatalogStore } from "../lib/catalog-core/file-store.ts";
import { applyImport, planImport, readManifest } from "../lib/catalog-core/importer.ts";
import { applyPriceSheet, buildPriceTemplate, parseCsv, planPriceSheet } from "../lib/catalog-core/price-sheet.ts";
import { readXlsxRows } from "../lib/catalog-core/xlsx.ts";
import { CATALOG_SCHEMA_VERSION, showcaseProblems, toPublicCatalog, toPublicDetails, type CatalogFile, type CatalogProduct } from "../lib/catalog-core/schema.ts";
import type { Product } from "../lib/types.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = path.join(ROOT, "data", "catalog.json");
const PUBLIC = path.join(ROOT, "data", "catalog.public.json");
const DETAILS = path.join(ROOT, "data", "catalog.details.json");
const LEGACY = path.join(ROOT, "data", "legacy", "demo-products.json");

const store = createFileCatalogStore({ root: ROOT });
const assets = createFileAssetStore({ root: ROOT });
const [command = "status", ...args] = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function init() {
  if (existsSync(CATALOG)) {
    console.error("data/catalog.json already exists; init does nothing (it never overwrites the catalog).");
    process.exitCode = 1;
    return;
  }
  const legacy = JSON.parse(await readFile(LEGACY, "utf8")) as Product[];
  const empty: CatalogFile = { schemaVersion: CATALOG_SCHEMA_VERSION, revision: 0, updatedAt: new Date().toISOString(), products: [] };
  await writeFile(CATALOG, JSON.stringify(empty, null, 2) + "\n", { flag: "wx" });

  const now = new Date().toISOString();
  const archived: CatalogProduct[] = legacy.map((p) => ({
    id: p.id,
    name: p.name,
    status: "archived",
    category: p.category,
    subcategory: null,
    brand: null,
    description: "",
    priceCents: p.priceCents,
    compareAtCents: null,
    stock: p.stock,
    badge: p.badge ?? null,
    featuredToday: false,
    images: [{ src: p.img, alt: p.name, view: "front" }],
    variants: [],
    attributes: {},
    label: null,
    labelFacts: {},
    reviewFlags: [],
    source: { kind: "legacy-demo", ref: "lib/catalog.ts before the catalog migration (data/legacy/demo-products.json)" },
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
  }));
  const saved = await store.update(0, (draft) => { draft.products.push(...archived); });
  console.log(`created data/catalog.json (revision ${saved.revision}) with ${archived.length} archived demo products`);
}

async function runImport() {
  const manifest = await readManifest(ROOT);
  const plan = await planImport({ manifest, catalog: await store.read(), assets });
  console.log(`manifest v${plan.manifestVersion}: ${plan.items.length} products`);
  console.log(`  new: ${plan.counts.new}   already in catalog: ${plan.counts.exists}   invalid: ${plan.counts.invalid}\n`);
  for (const item of plan.items) {
    const tag = item.status === "new" ? "NEW    " : item.status === "exists" ? "SKIP   " : "INVALID";
    const facts = [item.labelFacts.mrp && `label MRP ${item.labelFacts.mrp}`, item.labelFacts.netWeight].filter(Boolean).join(", ");
    console.log(`${tag} ${item.id.padEnd(40)} ${item.images.length} img  ${item.reviewFlags.length} flag(s)  ${facts}`);
    for (const p of item.problems) console.log(`          - ${p}`);
  }
  if (!flag("--apply")) {
    console.log("\npreview only: nothing was saved. Re-run with --apply to save the NEW items as drafts.");
    return;
  }
  const only = option("--only")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;
  const report = await applyImport(store, plan, only);
  console.log(`\nimported as drafts: ${report.imported.length}`);
  for (const id of report.imported) console.log(`  + ${id}`);
  console.log(`skipped (already in catalog): ${report.skippedExisting.length}`);
  console.log(`skipped (not approved): ${report.skippedNotApproved.length}`);
  console.log(`failed: ${report.failed.length}`);
  for (const f of report.failed) console.log(`  ! ${f.id}: ${f.problems.join("; ")}`);
  console.log(`catalog revision: ${report.revision}`);
  if (report.failed.length) process.exitCode = 2;
}

async function syncPublic() {
  const catalog = await store.read();
  const outputs = [
    { file: PUBLIC, name: "data/catalog.public.json", expected: JSON.stringify(toPublicCatalog(catalog), null, 2) + "\n" },
    { file: DETAILS, name: "data/catalog.details.json", expected: JSON.stringify(toPublicDetails(catalog), null, 2) + "\n" },
  ];
  for (const o of outputs) {
    const actual = existsSync(o.file) ? await readFile(o.file, "utf8") : "";
    if (flag("--check")) {
      if (actual !== o.expected) {
        console.error(`${o.name} is out of date. Run \`npm run catalog -- sync-public\`.`);
        process.exitCode = 1;
      } else console.log(`${o.name} is up to date.`);
    } else if (actual === o.expected) console.log(`${o.name} already up to date.`);
    else {
      await writeFile(o.file, o.expected);
      console.log(`rebuilt ${o.name}`);
    }
  }
}

async function showComingSoon() {
  const only = option("--only")?.split(",").map((x) => x.trim()).filter(Boolean);
  const shown: string[] = [];
  const skipped: string[] = [];
  const now = new Date().toISOString();
  await store.update(null, (draft) => {
    for (const p of draft.products) {
      if (p.status !== "draft" || (only && !only.includes(p.id))) continue;
      if (showcaseProblems(p).length) { skipped.push(p.id); continue; }
      p.status = "coming_soon";
      p.updatedAt = now;
      shown.push(p.id);
    }
  });
  console.log(`now shown in the shop as "price coming soon" (not for sale): ${shown.length}`);
  for (const id of shown) console.log(`  + ${id}`);
  if (skipped.length) console.log(`skipped (no images): ${skipped.join(", ")}`);
}

async function pricesTemplate() {
  const out = path.join(ROOT, "data", "import", "prices-template.csv");
  if (existsSync(out) && !flag("--force")) {
    console.error("data/import/prices-template.csv already exists (it may hold your prices). Use --force to overwrite.");
    process.exitCode = 1;
    return;
  }
  await writeFile(out, buildPriceTemplate(await store.read()));
  console.log("wrote data/import/prices-template.csv: fill in price / stock (one row per pack size), save as CSV or .xlsx.");
}

async function prices() {
  const file = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--stock");
  if (!file) {
    console.error("usage: npm run catalog -- prices <file.xlsx|file.csv> [--stock 50] [--apply] [--publish]");
    process.exitCode = 1;
    return;
  }
  const stockOpt = option("--stock");
  if (stockOpt !== undefined && !/^\d+$/.test(stockOpt)) {
    console.error("--stock must be a whole number, e.g. --stock 50");
    process.exitCode = 1;
    return;
  }
  const full = path.resolve(file);
  const rows = /\.xlsx$/i.test(full) ? readXlsxRows(await readFile(full)) : parseCsv(await readFile(full, "utf8"));
  const plan = planPriceSheet(rows, await store.read(), { defaultStock: stockOpt === undefined ? undefined : Number(stockOpt) });
  const fmt = (c: number | null) => (c === null ? "-" : (c / 100).toFixed(2).replace(/\.00$/, ""));
  for (const c of plan.changes)
    console.log(
      `${(c.productId + (c.pack ? ` [${c.pack}]` : "")).padEnd(46)} price ${fmt(c.priceCents).padStart(6)}` +
        `${c.compareAtCents ? `  was ${fmt(c.compareAtCents).padStart(6)}` : ""}  stock ${c.stock ?? "-"}${c.stockFromDefault ? " (default)" : ""}` +
        `${c.netWeight ? `  weight ${c.netWeight}` : ""}`,
    );
  console.log(`\n${plan.changes.length} row(s) to update, ${plan.emptyRows} empty row(s), ${plan.problems.length} problem(s)`);
  for (const pr of plan.problems) console.log(`  row ${pr.row} ${pr.id}: ${pr.message}`);
  if (plan.problems.length) {
    process.exitCode = 2;
    return console.log("nothing saved: fix the rows above.");
  }
  if (!flag("--apply")) return console.log("preview only: nothing was saved. Re-run with --apply.");
  const report = await applyPriceSheet(store, plan, { publish: flag("--publish") });
  console.log(`updated ${report.updated.length} product(s), added ${report.packsAdded.length} pack size(s) (revision ${report.revision})`);
  if (flag("--publish")) {
    console.log(`published for sale: ${report.published.length}`);
    for (const id of report.published) console.log(`  + ${id}`);
    for (const n of report.notPublished) console.log(`  not published ${n.id}: ${n.problems.join(" ")}`);
  }
}

async function status() {
  const file = await store.read();
  const by = (s: string) => file.products.filter((p) => p.status === s).length;
  console.log(
    `revision ${file.revision}, ${file.products.length} products: ${by("active")} active, ${by("coming_soon")} coming soon, ${by("draft")} draft, ${by("archived")} archived`,
  );
}

const commands: Record<string, () => Promise<unknown>> = {
  init,
  import: runImport,
  "sync-public": syncPublic,
  status,
  "show-coming-soon": showComingSoon,
  "prices-template": pricesTemplate,
  prices,
};
const run = commands[command];
if (!run) {
  console.error(`unknown command "${command}". Use: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}
run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
