import type { CartLine, Cents, LineChange, Product, Quote, QuoteLine } from "./types";

export const SHIPPING_CENTS: Cents = 499;
export const FREE_SHIPPING_THRESHOLD_CENTS: Cents = 5000;

export const shippingFor = (subtotalCents: Cents): Cents =>
  subtotalCents === 0 || subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : SHIPPING_CENTS;

type Lookup = (id: string) => Product | undefined;

/**
 * Builds a quote from cart lines. Unknown products are dropped and quantities
 * are clamped to stock — the caller decides whether that difference matters.
 */
export function buildQuote(items: readonly CartLine[], lookup: Lookup): Quote {
  const lines: QuoteLine[] = [];
  for (const { id, qty } of items) {
    const product = lookup(id);
    if (!product) continue;
    const safeQty = Math.min(Math.max(1, Math.floor(qty)), product.stock);
    if (safeQty <= 0) continue;
    lines.push({
      id,
      name: product.name,
      qty: safeQty,
      unitCents: product.priceCents,
      lineCents: product.priceCents * safeQty,
    });
  }
  const subtotalCents = lines.reduce((sum, l) => sum + l.lineCents, 0);
  const shippingCents = shippingFor(subtotalCents);
  return { lines, subtotalCents, shippingCents, totalCents: subtotalCents + shippingCents };
}

/** Line-by-line differences between what the customer saw and the fresh quote. */
export function diffQuotes(expected: readonly QuoteLine[], actual: Quote): LineChange[] {
  const changes: LineChange[] = [];
  const actualById = new Map(actual.lines.map((l) => [l.id, l]));
  for (const before of expected) {
    const after = actualById.get(before.id);
    if (!after) {
      changes.push({ kind: "removed", id: before.id, name: before.name });
      continue;
    }
    if (after.unitCents !== before.unitCents) {
      changes.push({ kind: "price", id: before.id, name: before.name, fromCents: before.unitCents, toCents: after.unitCents });
    }
    if (after.qty !== before.qty) {
      changes.push({ kind: "qty", id: before.id, name: before.name, fromQty: before.qty, toQty: after.qty });
    }
  }
  return changes;
}
