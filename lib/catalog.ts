import type { Category, Product } from "./types";
import publicCatalog from "@/data/catalog.public.json";

/**
 * The shop's catalog: published products only.
 *
 * data/catalog.public.json is generated from data/catalog.json (the admin's
 * full catalog) every time it is saved, so drafts and archived products never
 * reach the browser. The server prices carts and checkouts from this same list
 * (lib/server/catalog.ts), so a product that isn't here can't be bought.
 */
export const PRODUCTS: readonly Product[] = (publicCatalog as unknown as { products: Product[] }).products;

const byId = new Map(PRODUCTS.map((p) => [p.id, p]));

/**
 * Pack sizes are sold as their own items: "prey-anchovies--70g" resolves to a
 * Product with that pack's name, price and stock (and `productId` pointing at
 * the product page). That way the cart, quote and checkout code works unchanged.
 */
const bySku = new Map<string, Product>();
for (const p of PRODUCTS) {
  for (const v of p.variants ?? []) {
    const pack: Product = {
      ...p,
      id: v.sku,
      name: `${p.name} · ${v.label}`,
      priceCents: v.priceCents,
      stock: v.stock,
      productId: p.id,
      variantLabel: v.label,
    };
    delete pack.variants;
    delete pack.compareAtCents;
    if (v.compareAtCents) pack.compareAtCents = v.compareAtCents;
    bySku.set(v.sku, pack);
  }
}

export const getProduct = (id: string): Product | undefined => byId.get(id) ?? bySku.get(id);

/** The product page for an item (a pack links to its product). */
export const productHref = (p: Product) => `/shop/${p.productId ?? p.id}`;

/**
 * What "add to cart" should add for a product shown as a whole: itself, or its
 * first pack size that is in stock. Null when nothing can be added.
 */
export function purchasableId(p: Product): string | null {
  if (p.comingSoon) return null;
  if (p.variants?.length) return p.variants.find((v) => v.stock > 0)?.sku ?? null;
  return p.stock > 0 ? p.id : null;
}

export const CATEGORY_ACCENT: Record<Category, string> = {
  "food & treats": "var(--color-green)",
  "toys & play": "var(--color-darkblue)",
  "comfy beds": "var(--color-orange)",
  "walk & travel": "var(--color-maroon)",
  "grooming & care": "var(--color-pink)",
  "wear & style": "var(--color-lightblue)",
};
