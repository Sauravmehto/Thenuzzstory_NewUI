import type { CheckoutCustomer, OrderStatus, PaymentMethod, PaymentStatus, Quote } from "./types";

/**
 * The confirmation page lives at its own URL (/order/confirmed) so a refresh
 * or the back button never re-shows a filled cart or re-submits an order.
 *
 * This is only a convenience copy of what the SERVER saved (it's written after
 * /api/orders succeeds): it lets the confirmation page show the order and the
 * WhatsApp button after the redirect. It is not the record of the order. It
 * lives in sessionStorage: it survives a refresh, stays in this tab, and is
 * gone when the tab closes.
 */
const KEY = "nuzz-last-order";

export interface PlacedOrder {
  orderId: string;
  placedAt: string; // ISO timestamp
  quote: Quote;
  customer: CheckoutCustomer;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  /** Click-to-chat link with the order message filled in. */
  whatsappUrl: string;
  /** Whether the browser let us open WhatsApp in a new tab (it may have blocked the pop-up). */
  whatsappOpened: boolean;
}

export function saveLastOrder(order: PlacedOrder) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(order));
  } catch {
    /* storage blocked: the confirmation page falls back to a generic message */
  }
}

export function readLastOrder(): PlacedOrder | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlacedOrder>;
    if (typeof parsed.orderId !== "string" || !parsed.quote || !parsed.customer || typeof parsed.whatsappUrl !== "string") return null;
    // Only ever link to WhatsApp, whatever sessionStorage holds.
    if (!parsed.whatsappUrl.startsWith("https://wa.me/")) return null;
    return parsed as PlacedOrder;
  } catch {
    return null;
  }
}

/** Remember that the customer used the "open WhatsApp" button, so the page can say so. */
export function markWhatsappOpened() {
  const order = readLastOrder();
  if (!order) return;
  saveLastOrder({ ...order, whatsappOpened: true });
}
