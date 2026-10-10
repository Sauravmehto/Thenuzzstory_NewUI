import type { CheckoutCustomer, Payment, Quote } from "./types";

/**
 * The confirmation page lives at its own URL (/order/confirmed) so a refresh
 * or the back button never re-shows a filled cart or re-submits an order.
 * This demo has no order database, so the receipt travels in sessionStorage:
 * it survives a refresh, stays in this tab, and is gone when the tab closes.
 */
const KEY = "cozypaws-last-order";

export interface PlacedOrder {
  orderId: string;
  placedAt: string; // ISO timestamp
  quote: Quote;
  customer: CheckoutCustomer;
  payment?: Payment;
}

export function saveLastOrder(order: PlacedOrder) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    /* storage blocked: the confirmation page falls back to a generic thank-you */
  }
}

export function readLastOrder(): PlacedOrder | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlacedOrder>;
    if (typeof parsed.orderId !== "string" || !parsed.quote || !parsed.customer) return null;
    return parsed as PlacedOrder;
  } catch {
    return null;
  }
}
