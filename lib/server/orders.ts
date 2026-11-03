import "server-only";
import { randomBytes } from "node:crypto";
import { buildQuote } from "@/lib/pricing";
import { cleanCustomer } from "@/lib/validation";
import { getServerProduct } from "@/lib/server/catalog";
import type { DemoState } from "@/lib/server/demo";
import type { SavedOrder } from "@/lib/order-types";
import { currencyOf } from "@/lib/whatsapp-order";
import type { CheckoutCustomer, CartLine, PaymentMethod, Quote } from "@/lib/types";

/** Easy to read out loud and to type: no 0/O/1/I. */
const ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** "NS-241014-7KQ3XM": date (IST) + 6 random characters. Uniqueness is enforced by the store. */
export function newOrderId(now = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const date = ist.toISOString().slice(2, 10).replace(/-/g, "");
  const bytes = randomBytes(6);
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += ID_ALPHABET[bytes[i]! % ID_ALPHABET.length];
  return `NS-${date}-${suffix}`;
}

export const ORDER_ID_RE = /^NS-\d{6}-[2-9A-HJ-NP-Z]{6}$/;

/**
 * Prices the cart from the server's own catalog and builds the order record.
 * Nothing here reads a price from the request: only product ids and quantities.
 */
export function buildOrder(input: {
  orderId: string;
  customer: CheckoutCustomer;
  items: readonly CartLine[];
  paymentMethod: PaymentMethod;
  demo: DemoState;
  userId?: string;
  now?: Date;
}): { order: SavedOrder; quote: Quote } {
  const quote = buildQuote(input.items, (id) => getServerProduct(id, input.demo));
  const order: SavedOrder = {
    orderId: input.orderId,
    createdAt: (input.now ?? new Date()).toISOString(),
    status: "pending_confirmation",
    paymentStatus: "payment_pending",
    paymentMethod: input.paymentMethod,
    customer: cleanCustomer(input.customer),
    lines: quote.lines.map((l) => {
      const product = getServerProduct(l.id, input.demo);
      return {
        id: l.id,
        productId: product?.productId ?? l.id,
        name: l.name,
        ...(product?.variantLabel ? { packLabel: product.variantLabel } : {}),
        qty: l.qty,
        unitCents: l.unitCents,
        lineCents: l.lineCents,
      };
    }),
    subtotalCents: quote.subtotalCents,
    shippingCents: quote.shippingCents,
    totalCents: quote.totalCents,
    currency: currencyOf(),
    ...(input.userId ? { userId: input.userId } : {}),
    source: "web",
  };
  return { order, quote };
}
