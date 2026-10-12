export type Category =
  | "food & treats"
  | "toys & play"
  | "comfy beds"
  | "walk & travel"
  | "grooming & care"
  | "wear & style";

/** Money is always stored as integer cents. See lib/money.ts. */
export type Cents = number;

export type ImageView = "front" | "back" | "both" | "side" | "detail" | "lifestyle" | "other";

export interface ProductImage {
  src: string;
  alt: string;
  view: ImageView;
}

/** Text printed on the packaging, kept verbatim (see data/import/product-list.manifest.json). */
export interface ProductLabel {
  tagline?: string;
  story?: string;
  why?: string;
  ingredients?: string;
  /** Short "With oats, ..." line from the front of the pack. */
  keyIngredients?: string;
  nutrition?: { label: string; value: string }[];
  feeding?: { weight: string; portionPerDay: string }[];
  feedingText?: string;
  benefits?: string[];
  features?: string[];
  badges?: string[];
  storage?: string;
  advisory?: string[];
  note?: string;
  bestBefore?: string;
  packedAndMarketedBy?: string;
  manufacturedBy?: string;
  contact?: string;
  dietMark?: string;
}

/**
 * One pack size of a product, sold as its own item. `sku` is what the cart,
 * quote and checkout use (e.g. "prey-anchovies--70g").
 */
export interface ProductVariant {
  sku: string;
  label: string;
  priceCents: Cents;
  /** "Was" price shown struck through. Never what is charged. */
  compareAtCents?: Cents;
  stock: number;
  /** Pack weight in grams when the label says so ("70 g"), for the per-gram price. */
  grams?: number;
}

/** A product the shop is allowed to show and sell (see lib/catalog-core/schema.ts). */
export interface Product {
  id: string;
  name: string;
  priceCents: Cents;
  category: Category;
  /** Main image (same as images[0] when a gallery exists). */
  img: string;
  /** Units the warehouse can actually ship. The server enforces this. */
  stock: number;
  badge?: string;
  /** Gallery, main image first. Older products only have `img`. */
  images?: ProductImage[];
  subcategory?: string;
  brand?: string;
  description?: string;
  /** Optional "was" price shown struck through. Never what is charged. */
  compareAtCents?: Cents;
  attributes?: Record<string, string>;
  label?: ProductLabel;
  createdAt?: string;
  /** Listed under the shop's "today" offers filter. */
  featuredToday?: boolean;
  /** Shown in the shop without a price yet: can't be added to the cart or bought. */
  comingSoon?: boolean;
  /**
   * Pack sizes. When present, only the variants are sold: `priceCents` is the
   * lowest pack price (for "from ₹…") and `stock` the total across packs.
   */
  variants?: ProductVariant[];
  /** Set on a pack looked up by its SKU: the product it belongs to. */
  productId?: string;
  /** Set on a pack looked up by its SKU, e.g. "70 g". */
  variantLabel?: string;
}

/** What the client stores: just an id and a quantity. Never a price. */
export interface CartLine {
  id: string;
  qty: number;
}

export interface QuoteLine {
  id: string;
  name: string;
  qty: number;
  unitCents: Cents;
  lineCents: Cents;
}

export interface Quote {
  lines: QuoteLine[];
  subtotalCents: Cents;
  shippingCents: Cents;
  totalCents: Cents;
}

export type LineChange =
  | { kind: "price"; id: string; name: string; fromCents: Cents; toCents: Cents }
  | { kind: "qty"; id: string; name: string; fromQty: number; toQty: number }
  | { kind: "removed"; id: string; name: string };

// ---- API contracts -------------------------------------------------------

export interface CartUpdateRequest {
  id: string;
  qty: number;
}

export type CartUpdateResponse =
  | { ok: true; line: CartLine; stock: number }
  | {
      ok: false;
      code: "insufficient_stock" | "unknown_product" | "invalid_request" | "unavailable";
      /** How many the server can actually give you (0 = none). */
      available?: number;
      message: string;
    };

export interface CheckoutCustomer {
  name: string;
  email: string;
  address: string;
  city: string;
  zip: string;
}

export type Payment =
  | { method: "card" }
  /** Simulated wallet payment: the tx hash is fake, see components/WalletPayDialog.tsx. */
  | { method: "wallet"; account: string; txHash: string };

export interface CheckoutRequest {
  customer: CheckoutCustomer;
  items: CartLine[];
  /** The quote the customer was looking at when they pressed "place order". */
  expected: { lines: QuoteLine[]; totalCents: Cents };
  /** Defaults to the demo card flow when omitted. */
  payment?: Payment;
}

export interface QuoteRequest {
  items: CartLine[];
  expected?: { lines: QuoteLine[]; totalCents: Cents };
}

export type QuoteResponse =
  | { ok: true; quote: Quote; changes: LineChange[] }
  | { ok: false; code: "invalid_request" | "empty_cart"; message: string };

export type CheckoutResponse =
  | { ok: true; orderId: string; quote: Quote; payment: Payment; message: string }
  | { ok: false; code: "validation"; errors: Partial<Record<keyof CheckoutCustomer | "items", string>> }
  | { ok: false; code: "quote_changed"; quote: Quote; changes: LineChange[] }
  | { ok: false; code: "invalid_request" | "empty_cart" | "unavailable" | "payment_invalid"; message: string };
