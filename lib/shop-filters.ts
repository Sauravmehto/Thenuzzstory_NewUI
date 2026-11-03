import { CATEGORIES } from "./catalog-core/schema";
import type { Category, Product } from "./types";

/**
 * The filter row on /shop, in display order. Each filter mirrors a group of
 * product photos (source-assets/product_list/<folder>). Rename a label here;
 * the key is what goes in the URL (?filter=krunch), so keep keys stable.
 */
export interface ShopFilter {
  key: string;
  label: string;
  /** Shown with the "offer" tag (today's deals). */
  offer?: boolean;
  match: (p: Product) => boolean;
}

export const SHOP_FILTERS: readonly ShopFilter[] = [
  { key: "all", label: "all", match: () => true },
  { key: "today", label: "today", offer: true, match: (p) => p.featuredToday === true },
  { key: "tshirts", label: "t-shirts", match: (p) => p.category === "wear & style" },
  { key: "bed", label: "bed", match: (p) => p.category === "comfy beds" },
  { key: "dehydrated", label: "dehydrated", match: (p) => p.subcategory === "dehydrated treats" },
  { key: "krunch", label: "krunch", match: (p) => p.subcategory === "crunchy dog treats" },
  { key: "meal-booster", label: "meal booster", match: (p) => p.subcategory === "meal toppers" },
  { key: "peanut-butter", label: "peanut butter", match: (p) => p.subcategory === "spreads" },
];

/** Older links use ?category=<category> (e.g. the footer). Map them onto a filter where one fits. */
const CATEGORY_TO_FILTER: Partial<Record<Category, string>> = {
  "comfy beds": "bed",
  "wear & style": "tshirts",
};

export type ActiveFilter =
  | { kind: "filter"; filter: ShopFilter }
  /** A category without its own pill: shown as an extra, removable pill. */
  | { kind: "category"; category: Category };

export function resolveFilter(filterParam: string | null, categoryParam: string | null): ActiveFilter {
  const byKey = (key: string | undefined) => SHOP_FILTERS.find((f) => f.key === key);
  const direct = byKey(filterParam ?? undefined);
  if (direct) return { kind: "filter", filter: direct };
  if (categoryParam && CATEGORIES.includes(categoryParam as Category)) {
    const mapped = byKey(CATEGORY_TO_FILTER[categoryParam as Category]);
    if (mapped) return { kind: "filter", filter: mapped };
    return { kind: "category", category: categoryParam as Category };
  }
  return { kind: "filter", filter: SHOP_FILTERS[0]! };
}

export type SortKey = "relevance" | "price-asc" | "price-desc" | "newest";

export const SORT_OPTIONS: readonly { key: SortKey; label: string }[] = [
  { key: "relevance", label: "relevance" },
  { key: "newest", label: "newest" },
  { key: "price-asc", label: "price: low to high" },
  { key: "price-desc", label: "price: high to low" },
];

export const parseSort = (raw: string | null): SortKey =>
  SORT_OPTIONS.some((o) => o.key === raw) ? (raw as SortKey) : "relevance";

/** Text a product can be found by. */
export const searchText = (p: Product) =>
  [p.name, p.category, p.subcategory, p.brand, p.label?.keyIngredients].filter(Boolean).join(" ").toLowerCase();

/**
 * Sorts without mutating. "relevance" keeps catalog order, but with a search
 * term names that start with it come first. Products without a date sort last
 * under "newest".
 */
export function sortProducts(list: readonly Product[], sort: SortKey, query: string): Product[] {
  const out = [...list];
  const unpriced = (p: Product) => (p.comingSoon || p.priceCents <= 0 ? 1 : 0);
  if (sort === "price-asc") return out.sort((a, b) => unpriced(a) - unpriced(b) || a.priceCents - b.priceCents);
  if (sort === "price-desc") return out.sort((a, b) => unpriced(a) - unpriced(b) || b.priceCents - a.priceCents);
  if (sort === "newest") return out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  if (!query) return out;
  const q = query.toLowerCase();
  const rank = (p: Product) => (p.name.toLowerCase().startsWith(q) ? 0 : p.name.toLowerCase().includes(q) ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b)); // stable: ties keep catalog order
}
