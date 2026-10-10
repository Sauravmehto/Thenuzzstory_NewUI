export type Category =
  | "food & treats"
  | "toys & play"
  | "comfy beds"
  | "walk & travel"
  | "grooming & care";

/** Money is always stored as integer cents. See lib/money.ts. */
export type Cents = number;

export interface Product {
  id: string;
  name: string;
  priceCents: Cents;
  category: Category;
  img: string;
  /** Units the warehouse can actually ship. The server enforces this. */
  stock: number;
  badge?: string;
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
