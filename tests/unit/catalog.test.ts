import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileAssetStore, createFileCatalogStore, RevisionConflictError } from "@/lib/catalog-core/file-store";
import { applyImport, planImport, type Manifest } from "@/lib/catalog-core/importer";
import {
  isValidImageSrc,
  parseMoneyInput,
  publishProblems,
  toPublicCatalog,
  toPublicDetails,
  validateEditable,
  type CatalogFile,
  type CatalogProduct,
} from "@/lib/catalog-core/schema";
import realCatalog from "@/data/catalog.json";
import realPublic from "@/data/catalog.public.json";
import realDetails from "@/data/catalog.details.json";

const now = "2026-10-10T00:00:00.000Z";
const product = (over: Partial<CatalogProduct> = {}): CatalogProduct => ({
  id: "test-product",
  name: "Test product",
  status: "draft",
  category: "food & treats",
  subcategory: null,
  brand: null,
  description: "Printed description.",
  priceCents: null,
  compareAtCents: null,
  stock: null,
  badge: null,
  featuredToday: false,
  images: [{ src: "/assets/products/test-product/front.jpg", alt: "Front of the pack", view: "front" }],
  variants: [],
  attributes: {},
  label: null,
  labelFacts: { mrp: "₹349/-" },
  reviewFlags: [],
  source: { kind: "admin" },
  createdAt: now,
  updatedAt: now,
  publishedAt: null,
  ...over,
});
const file = (products: CatalogProduct[]): CatalogFile => ({ schemaVersion: 1, revision: 1, updatedAt: now, products });

describe("public catalog", () => {
  it("only exposes active products", () => {
    const pub = toPublicCatalog(
      file([
        product({ id: "a", status: "draft", priceCents: 999, stock: 5 }),
        product({ id: "b", status: "archived", priceCents: 999, stock: 5 }),
        product({ id: "c", status: "active", priceCents: 999, stock: 5 }),
      ]),
    );
    expect(pub.products.map((p) => p.id)).toEqual(["c"]);
  });

  it("never exposes an active product without a price or stock", () => {
    const pub = toPublicCatalog(file([product({ status: "active", priceCents: null, stock: 3 })]));
    expect(pub.products).toEqual([]);
  });

  it("never turns the printed MRP into a price", () => {
    const [p] = toPublicCatalog(file([product({ status: "active", priceCents: 1299, stock: 1 })])).products;
    expect(p!.priceCents).toBe(1299);
    expect(JSON.stringify(p)).not.toContain("349");
  });

  it("the committed public file matches the committed catalog", () => {
    expect(toPublicCatalog(realCatalog as unknown as CatalogFile)).toEqual(realPublic);
    expect(toPublicDetails(realCatalog as unknown as CatalogFile)).toEqual(realDetails);
  });

  it("keeps long label text out of the public card data (it ships in every page)", () => {
    const pub = JSON.stringify(realPublic);
    for (const p of (realCatalog as unknown as CatalogFile).products) {
      if (p.label?.story) expect(pub).not.toContain(p.label.story);
      if (p.description.length > 40) expect(pub).not.toContain(p.description);
    }
  });

  it("no imported product is for sale until it has a price", () => {
    const imported = (realCatalog as unknown as CatalogFile).products.filter((p) => p.source.kind === "manifest");
    expect(imported).toHaveLength(27);
    for (const p of imported) {
      if (p.status === "active") {
        if (p.variants.length) for (const v of p.variants) expect(v.priceCents).toBeGreaterThan(0);
        else expect(p.priceCents).toBeGreaterThan(0);
      } else expect(["draft", "coming_soon", "archived"]).toContain(p.status);
    }
    for (const pub of (realPublic as { products: { comingSoon?: boolean; priceCents: number }[] }).products)
      if (pub.priceCents === 0) expect(pub.comingSoon).toBe(true);
  });

  it("coming-soon products are visible but carry no price or stock", () => {
    const [p] = toPublicCatalog(file([product({ status: "coming_soon", priceCents: 999, stock: 5 })])).products;
    expect(p).toMatchObject({ comingSoon: true, priceCents: 0, stock: 0 });
    expect(toPublicCatalog(file([product({ status: "coming_soon", images: [] })])).products).toEqual([]);
  });
});

describe("publish rules", () => {
  it("lists what is missing", () => {
    expect(publishProblems(product({ reviewFlags: ["check MRP"] }))).toEqual([
      "Set a selling price.",
      "Set the stock quantity.",
      "Resolve 1 review note.",
    ]);
  });

  it("is ready once price, stock, image and description are in and notes resolved", () => {
    expect(publishProblems(product({ priceCents: 999, stock: 0 }))).toEqual([]);
  });
});

describe("validateEditable", () => {
  const valid = { ...product(), priceCents: 999, stock: 3 };

  it("accepts a valid product", () => {
    expect(validateEditable(valid).ok).toBe(true);
  });

  it("rejects bad money, stock and image paths", () => {
    const r = validateEditable({
      ...valid,
      priceCents: 12.5,
      stock: -1,
      images: [{ src: "/assets/../../etc/passwd.jpg", alt: "x", view: "front" }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["images", "priceCents", "stock"]);
  });

  it("requires the was-price to be higher than the price", () => {
    const r = validateEditable({ ...valid, compareAtCents: 999 });
    expect(r.ok).toBe(false);
  });

  it("requires alt text", () => {
    const r = validateEditable({ ...valid, images: [{ src: "/assets/products/x/front.jpg", alt: " ", view: "front" }] });
    expect(r.ok).toBe(false);
  });

  it("parses money strictly", () => {
    expect(parseMoneyInput("12.99")).toBe(1299);
    expect(parseMoneyInput("12.9")).toBe(1290);
    expect(parseMoneyInput("12")).toBe(1200);
    expect(parseMoneyInput("")).toBeNull();
    for (const bad of ["$12", "12,99", "1.999", "-3", "abc"]) expect(parseMoneyInput(bad)).toBe("invalid");
  });

  it("refuses image paths outside /assets", () => {
    expect(isValidImageSrc("/assets/products/a/front.jpg")).toBe(true);
    expect(isValidImageSrc("/assets/products/../x.jpg")).toBe(false);
    expect(isValidImageSrc("https://evil.example/x.jpg")).toBe(false);
    expect(isValidImageSrc("/assets/products/a/front.svg")).toBe(false);
  });
});

describe("file store + import", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "nuzz-catalog-"));
    await mkdir(path.join(root, "data"), { recursive: true });
    await writeFile(path.join(root, "data", "catalog.json"), JSON.stringify(file([])));
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  const manifest: Manifest = {
    version: 1,
    sourceRoot: "source-assets/product_list",
    outputRoot: "public/assets/products",
    brand: "The Nuzz Story",
    lines: {},
    products: [
      {
        id: "prey-anchovies", name: "PREY Anchovies", line: null, category: "food & treats", subcategory: "dehydrated treats",
        images: [{ file: "dehydrated/anchovies_front.jpg", view: "front", fit: "pad", alt: "Pouch, front" }],
        label: { why: "Printed text.", labelMrp: "₹349/-" }, flags: [],
      },
    ],
  };
  const assets = { exists: async () => true };

  it("imports as a draft, and a rerun skips instead of duplicating", async () => {
    const store = createFileCatalogStore({ root });
    const first = await applyImport(store, await planImport({ manifest, catalog: await store.read(), assets }), null);
    expect(first.imported).toEqual(["prey-anchovies"]);

    const again = await applyImport(store, await planImport({ manifest, catalog: await store.read(), assets }), null);
    expect(again.imported).toEqual([]);
    expect(again.skippedExisting).toEqual(["prey-anchovies"]);

    const saved = await store.read();
    expect(saved.products).toHaveLength(1);
    expect(saved.products[0]).toMatchObject({ status: "draft", priceCents: null, labelFacts: { mrp: "₹349/-" } });
    expect(saved.revision).toBe(first.revision); // the no-op rerun didn't rewrite the file
    const pub = JSON.parse(await readFile(path.join(root, "data", "catalog.public.json"), "utf8"));
    expect(pub.products).toEqual([]);
  });

  it("flags missing optimized images instead of importing", async () => {
    const store = createFileCatalogStore({ root });
    const plan = await planImport({ manifest, catalog: await store.read(), assets: { exists: async () => false } });
    expect(plan.counts.invalid).toBe(1);
    const report = await applyImport(store, plan, null);
    expect(report.imported).toEqual([]);
    expect(report.failed).toHaveLength(1);
  });

  it("rejects a save made against a stale revision", async () => {
    const store = createFileCatalogStore({ root });
    const { revision } = await store.read();
    await store.update(revision, (d) => { d.products.push(product({ id: "one" })); });
    await expect(store.update(revision, (d) => { d.products.push(product({ id: "two" })); })).rejects.toBeInstanceOf(
      RevisionConflictError,
    );
    expect((await store.read()).products.map((p) => p.id)).toEqual(["one"]);
  });

  it("asset store never overwrites and refuses traversal", async () => {
    const assetsStore = createFileAssetStore({ root });
    const a = await assetsStore.saveProductImage("prey-anchovies", "upload", Buffer.from("a"), "jpg");
    const b = await assetsStore.saveProductImage("prey-anchovies", "upload", Buffer.from("b"), "jpg");
    expect(a).toBe("/assets/products/prey-anchovies/upload.jpg");
    expect(b).toBe("/assets/products/prey-anchovies/upload-2.jpg");
    expect(await assetsStore.exists("/assets/../package.json")).toBe(false);
    await expect(assetsStore.saveProductImage("../../evil", "x", Buffer.from("c"), "jpg")).rejects.toThrow();
  });
});

describe("admin operations", () => {
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "nuzz-admin-"));
    await mkdir(path.join(root, "data"), { recursive: true });
    await writeFile(path.join(root, "data", "catalog.json"), JSON.stringify(file([product({ id: "draft-one", reviewFlags: ["check"] })])));
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  const assets = { exists: async (src: string) => src.startsWith("/assets/products/") };
  const fields = (over: Record<string, unknown> = {}) => ({
    name: "Draft one", category: "food & treats", subcategory: null, brand: null, description: "Printed description.",
    priceCents: null, compareAtCents: null, stock: null, badge: null, featuredToday: false,
    images: [{ src: "/assets/products/test-product/front.jpg", alt: "Front of the pack", view: "front" }],
    attributes: {}, label: null, reviewFlags: ["check"], ...over,
  });

  it("walks a draft to published only once it is complete", async () => {
    const { changeStatus, updateProduct } = await import("@/lib/catalog-core/admin-ops");
    const store = createFileCatalogStore({ root });
    let current = (await store.read()).products[0]!;

    const early = await changeStatus(store, current.id, current.updatedAt, "publish");
    expect(early).toMatchObject({ ok: false, code: "not_ready" });
    if (!early.ok) expect(early.problems).toContain("Set a selling price.");

    const edited = await updateProduct(store, assets, current.id, current.updatedAt, fields({ priceCents: 1299, stock: 4, reviewFlags: [] }), new Date("2026-10-11T00:00:00Z"));
    expect(edited.ok).toBe(true);
    current = (edited as { product: CatalogProduct }).product;

    const published = await changeStatus(store, current.id, current.updatedAt, "publish", new Date("2026-10-12T00:00:00Z"));
    expect(published).toMatchObject({ ok: true, product: { status: "active" } });
    const pub = JSON.parse(await readFile(path.join(root, "data", "catalog.public.json"), "utf8"));
    expect(pub.products.map((p: { id: string; priceCents: number }) => [p.id, p.priceCents])).toEqual([["draft-one", 1299]]);
  });

  it("rejects an edit made against an old copy", async () => {
    const { updateProduct } = await import("@/lib/catalog-core/admin-ops");
    const store = createFileCatalogStore({ root });
    const r = await updateProduct(store, assets, "draft-one", "1999-01-01T00:00:00.000Z", fields());
    expect(r).toMatchObject({ ok: false, status: 409, code: "conflict" });
  });

  it("won't blank the price of a live product", async () => {
    const { changeStatus, updateProduct } = await import("@/lib/catalog-core/admin-ops");
    const store = createFileCatalogStore({ root });
    let p = (await store.read()).products[0]!;
    p = ((await updateProduct(store, assets, p.id, p.updatedAt, fields({ priceCents: 999, stock: 2, reviewFlags: [] }), new Date("2026-10-11T00:00:00Z"))) as { product: CatalogProduct }).product;
    p = ((await changeStatus(store, p.id, p.updatedAt, "publish", new Date("2026-10-12T00:00:00Z"))) as { product: CatalogProduct }).product;
    const r = await updateProduct(store, assets, p.id, p.updatedAt, fields({ priceCents: null, stock: 2, reviewFlags: [] }));
    expect(r).toMatchObject({ ok: false, code: "would_break_live" });
  });

  it("deletes only with the typed id, and never a live product", async () => {
    const { changeStatus, deleteProduct, updateProduct } = await import("@/lib/catalog-core/admin-ops");
    const store = createFileCatalogStore({ root });
    expect(await deleteProduct(store, "draft-one", "draft")).toMatchObject({ ok: false, code: "confirm_required" });
    let p = (await store.read()).products[0]!;
    p = ((await updateProduct(store, assets, p.id, p.updatedAt, fields({ priceCents: 999, stock: 2, reviewFlags: [] }), new Date("2026-10-11T00:00:00Z"))) as { product: CatalogProduct }).product;
    await changeStatus(store, p.id, p.updatedAt, "publish", new Date("2026-10-12T00:00:00Z"));
    expect(await deleteProduct(store, "draft-one", "draft-one")).toMatchObject({ ok: false, code: "is_live" });
    expect((await store.read()).products).toHaveLength(1);
  });

  it("refuses images that don't exist", async () => {
    const { createProduct } = await import("@/lib/catalog-core/admin-ops");
    const store = createFileCatalogStore({ root });
    const r = await createProduct(store, { exists: async () => false }, fields({ name: "New thing" }));
    expect(r).toMatchObject({ ok: false, code: "validation" });
  });

  it("creates drafts with unique ids", async () => {
    const { createProduct } = await import("@/lib/catalog-core/admin-ops");
    const store = createFileCatalogStore({ root });
    const a = await createProduct(store, assets, fields({ name: "Draft One" }));
    expect(a).toMatchObject({ ok: true, product: { id: "draft-one-2", status: "draft", priceCents: null } });
  });
});

describe("price sheet (Excel / CSV)", () => {
  const cat = () =>
    file([
      product({ id: "a", name: "PREY Anchovies" }),
      product({ id: "b", name: "B", priceCents: 500, stock: 3 }),
      product({
        id: "c",
        name: "C",
        variants: [{ id: "70g", label: "70 g", priceCents: 100, compareAtCents: null, stock: 9 }],
      }),
    ]);

  it("reads the store's Excel layout: product name, pack size, Price = was, Offer Price = price", async () => {
    const { planPriceSheet } = await import("@/lib/catalog-core/price-sheet");
    const rows = [
      ["Product Name", "Pack Size", "Price (₹)", "Offer Price (₹)"],
      ["PREY Anchovies", "70 g", "340", "310"],
      ["prey anchovies", "150 g", "630", "570"],
    ];
    const plan = planPriceSheet(rows, cat(), { defaultStock: 50 });
    expect(plan.problems).toEqual([]);
    expect(plan.changes).toEqual([
      { productId: "a", name: "PREY Anchovies", pack: "70 g", priceCents: 31000, compareAtCents: 34000, stock: 50, stockFromDefault: true, netWeight: null },
      { productId: "a", name: "PREY Anchovies", pack: "150 g", priceCents: 57000, compareAtCents: 63000, stock: 50, stockFromDefault: true, netWeight: null },
    ]);
  });

  it('"N/A" or "Not specified" in the pack column means a single price, not a pack', async () => {
    const { planPriceSheet } = await import("@/lib/catalog-core/price-sheet");
    const rows = [["Product Name", "Pack Size", "Price (₹)", "Offer Price (₹)"], ["B", "N/A", "449", "349"], ["PREY Anchovies", "Not specified", "500", "400"]];
    const plan = planPriceSheet(rows, cat());
    expect(plan.problems).toEqual([]);
    expect(plan.changes.map((c) => [c.productId, c.pack, c.priceCents, c.compareAtCents])).toEqual([
      ["b", null, 34900, 44900],
      ["a", null, 40000, 50000],
    ]);
  });

  it("default stock never overrides stock that already exists", async () => {
    const { planPriceSheet } = await import("@/lib/catalog-core/price-sheet");
    const plan = planPriceSheet([["id", "pack", "price"], ["c", "70g", "120"]], cat(), { defaultStock: 50 });
    expect(plan.changes[0]).toMatchObject({ pack: "70g", priceCents: 12000, stock: null, stockFromDefault: false });
  });

  it("reads CSV with BOM, semicolons, rupee signs and thousands commas", async () => {
    const { planPriceSheet } = await import("@/lib/catalog-core/price-sheet");
    const csv = ["﻿id;name;price;was_price;stock;net_weight", "b;B;₹1,299.00;;12;70 g", ""].join("\r\n");
    const plan = planPriceSheet(csv, cat());
    expect(plan.problems).toEqual([]);
    expect(plan.changes).toEqual([
      { productId: "b", name: "B", pack: null, priceCents: 129900, compareAtCents: null, stock: 12, stockFromDefault: false, netWeight: "70 g" },
    ]);
  });

  it("reports bad rows instead of guessing", async () => {
    const { planPriceSheet } = await import("@/lib/catalog-core/price-sheet");
    // unknown id · a decimal comma (12,99 must not become 1299) · not a number · pack product without a pack · duplicate
    const csv = ["id,pack,price,was_price,stock", "nope,,10,,1", 'b,,"12,99",,1', "b,,abc,,x", "c,,100,,1", "a,70 g,10,,1", "a,70g,11,,1", ""].join("\n");
    const plan = planPriceSheet(csv, cat());
    expect(plan.problems.map((p) => p.row)).toEqual([2, 3, 4, 5, 7]);
  });

  it("applies packs without publishing, and leaves empty cells unchanged", async () => {
    const { applyPriceSheet, planPriceSheet } = await import("@/lib/catalog-core/price-sheet");
    const root = await mkdtemp(path.join(os.tmpdir(), "nuzz-prices-"));
    try {
      await mkdir(path.join(root, "data"));
      await writeFile(path.join(root, "data", "catalog.json"), JSON.stringify(cat()));
      const store = createFileCatalogStore({ root });
      const rows = [["id", "pack", "price", "was price", "stock"], ["a", "70 g", "310", "340", "50"], ["a", "150 g", "570", "", ""], ["b", "", "", "", "7"]];
      const report = await applyPriceSheet(store, planPriceSheet(rows, await store.read()), { publish: false });
      expect(report.packsAdded).toEqual(["a: 70 g", "a: 150 g"]);
      const [a, b] = (await store.read()).products;
      expect(a).toMatchObject({ status: "draft" });
      expect(a!.variants).toEqual([
        { id: "70g", label: "70 g", priceCents: 31000, compareAtCents: 34000, stock: 50 },
        { id: "150g", label: "150 g", priceCents: 57000, compareAtCents: null, stock: null },
      ]);
      expect(b).toMatchObject({ priceCents: 500, stock: 7 });
      // A pack without stock blocks publishing.
      expect(publishProblems(a!)[0]).toContain("150 g");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("pack sizes in the shop", () => {
  const withPacks = (status: CatalogProduct["status"]) =>
    product({
      id: "p",
      status,
      variants: [
        { id: "70g", label: "70 g", priceCents: 31000, compareAtCents: 34000, stock: 50 },
        { id: "300g", label: "300 g", priceCents: 104000, compareAtCents: 115000, stock: 0 },
      ],
    });

  it("publishes each pack as its own SKU, from the cheapest price", () => {
    const [p] = toPublicCatalog(file([withPacks("active")])).products;
    expect(p).toMatchObject({ priceCents: 31000, compareAtCents: 34000, stock: 50 });
    expect(p!.variants).toEqual([
      { sku: "p--70g", label: "70 g", priceCents: 31000, compareAtCents: 34000, stock: 50, grams: 70 },
      { sku: "p--300g", label: "300 g", priceCents: 104000, compareAtCents: 115000, stock: 0, grams: 300 },
    ]);
  });

  it("a coming-soon product exposes no pack prices", () => {
    const [p] = toPublicCatalog(file([withPacks("coming_soon")])).products;
    expect(p).toMatchObject({ comingSoon: true, priceCents: 0, stock: 0 });
    expect(p!.variants).toBeUndefined();
  });

  it("rejects a pack whose was-price isn't higher, and duplicate packs", () => {
    const base = { ...product(), priceCents: null };
    expect(validateEditable({ ...base, variants: [{ label: "70 g", priceCents: 300, compareAtCents: 300, stock: 1 }] }).ok).toBe(false);
    expect(validateEditable({ ...base, variants: [{ label: "70 g", priceCents: 1, stock: 1 }, { label: "70g", priceCents: 2, stock: 1 }] }).ok).toBe(false);
  });

  it("reads pack weights", async () => {
    const { gramsFromLabel } = await import("@/lib/catalog-core/schema");
    expect(gramsFromLabel("70 g")).toBe(70);
    expect(gramsFromLabel("1.5 kg")).toBe(1500);
    expect(gramsFromLabel("Large")).toBeUndefined();
  });
});

describe("xlsx reader", () => {
  it("reads the store's pricing workbook", async () => {
    const { readXlsxRows } = await import("@/lib/catalog-core/xlsx");
    const { readFile: read } = await import("node:fs/promises");
    const rows = readXlsxRows(await read("source-assets/product price/PREY_Demo_Product_Pricing.xlsx"));
    // The workbook is edited over time: check its shape, not exact contents.
    expect(rows[0]).toEqual(expect.arrayContaining(["Product Name", "Pack Size", "Price (₹)", "Offer Price (₹)"]));
    const name = rows[0]!.indexOf("Product Name");
    const pack = rows[0]!.indexOf("Pack Size");
    expect(rows.some((r) => r[name] === "PREY Anchovies" && r[pack] === "70 g")).toBe(true);
    expect(rows.length).toBeGreaterThan(1);
  });
});
