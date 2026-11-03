import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { diffQuotes } from "@/lib/pricing";
import { PAYMENT_OPTIONS } from "@/lib/payment-methods";
import { buildWhatsappMessage, whatsappUrl } from "@/lib/whatsapp-order";
import type { SavedOrder } from "@/lib/order-types";
import type { OrderRequest, OrderResponse } from "@/lib/types";
import { validateCustomer, type CustomerErrors } from "@/lib/validation";
import { accountStore } from "@/lib/server/account-store";
import { accountOrderFrom, addOrder } from "@/lib/server/account-data";
import { requireSameOrigin, sessionUser } from "@/lib/server/auth";
import { readDemo, sleep } from "@/lib/server/demo";
import { hashKey, orderStore, type OrderStore } from "@/lib/server/order-store";
import { buildOrder, newOrderId } from "@/lib/server/orders";

export const dynamic = "force-dynamic";

const MAX_LINES = 50;
const MAX_QTY = 99;
const MAX_ID_ATTEMPTS = 5;
const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;

const fail = (status: number, body: Extract<OrderResponse, { ok: false }>) => NextResponse.json<OrderResponse>(body, { status });

/** The success body, built from the SAVED order. */
function savedResponse(order: SavedOrder, replay = false): NextResponse {
  const message = buildWhatsappMessage(order);
  const body: OrderResponse = {
    ok: true,
    orderId: order.orderId,
    placedAt: order.createdAt,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    quote: {
      lines: order.lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty, unitCents: l.unitCents, lineCents: l.lineCents })),
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      totalCents: order.totalCents,
    },
    whatsappMessage: message,
    whatsappUrl: whatsappUrl(message),
    ...(replay ? { replay: true } : {}),
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store", ...(replay ? { "idempotent-replay": "true" } : {}) } });
}

/**
 * Place an order. The order is SAVED first; the WhatsApp link in the answer is
 * built from the saved record. If saving fails the customer gets an error and
 * no link, so we never ask anyone to confirm an order we don't have.
 *
 * Prices and totals come from the server's catalog. The request's `expected`
 * quote is only compared against them, to tell the customer when something
 * changed while they were checking out.
 */
export async function POST(req: NextRequest) {
  const blocked = requireSameOrigin(req);
  if (blocked) return blocked;

  const demo = readDemo(req);
  await sleep(demo.latencyMs);

  const body = (await req.json().catch(() => null)) as unknown;
  if (!isOrderRequest(body)) return fail(400, { ok: false, code: "invalid_request", message: "Something went wrong with the order form. Please reload the page and try again." });

  const errors: CustomerErrors & { items?: string } = validateCustomer(body.customer);
  if (body.items.length === 0) errors.items = "Your cart is empty.";
  if (Object.keys(errors).length > 0) return fail(422, { ok: false, code: "validation", errors });

  const idemHeader = req.headers.get("idempotency-key");
  if (idemHeader !== null && !KEY_RE.test(idemHeader))
    return fail(400, { ok: false, code: "invalid_request", message: "Something went wrong. Please reload the page and try again." });

  let userId: string | undefined;
  try {
    userId = (await sessionUser(req))?.id;
  } catch {
    /* an account problem never blocks an order */
  }

  // Price from the server's own catalog.
  const { order: draft, quote } = buildOrder({
    orderId: "pending",
    customer: body.customer,
    items: body.items,
    paymentMethod: body.paymentMethod,
    demo,
    userId,
  });
  if (quote.lines.length === 0)
    return fail(409, { ok: false, code: "empty_cart", message: "Nothing in your cart is available any more." });

  // Never save a different total than the one the customer agreed to.
  const changes = diffQuotes(body.expected.lines, quote);
  if (changes.length > 0 || quote.totalCents !== body.expected.totalCents)
    return fail(409, { ok: false, code: "quote_changed", quote, changes });

  let store: OrderStore;
  try {
    store = await orderStore();
  } catch (err) {
    console.error("Order store unavailable", err);
    return fail(503, { ok: false, code: "storage_failed", message: "We couldn't save your order right now. Your cart is safe: please try again in a moment." });
  }

  // Same key + same order = the order we already saved (a double click or a retry after a bad connection).
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([draft.customer, draft.lines.map((l) => [l.id, l.qty]), draft.paymentMethod]))
    .digest("hex");
  const keyHash = idemHeader ? hashKey(idemHeader) : null;

  try {
    if (keyHash) {
      const known = await store.getIdempotency(keyHash);
      if (known) {
        if (known.fingerprint !== fingerprint)
          return fail(409, { ok: false, code: "idempotency_conflict", message: "This order was changed after it was first sent. Please reload the page and place it again." });
        const existing = await store.get(known.orderId);
        if (existing) return savedResponse(existing, true);
        await store.releaseIdempotency(keyHash); // the claim outlived its order: start over
      }
    }

    // Save, with a fresh id if (very unlikely) one is taken.
    let order: SavedOrder | null = null;
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS && !order; attempt++) {
      const candidate = { ...draft, orderId: newOrderId() };
      if (await store.create(candidate)) order = candidate;
    }
    if (!order) throw new Error("Couldn't find a free order id.");

    if (keyHash) {
      const claimed = await store.claimIdempotency(keyHash, { orderId: order.orderId, fingerprint, createdAt: order.createdAt });
      if (!claimed) {
        // Another request with this key won the race: keep its order, drop ours.
        await store.remove(order.orderId);
        const winner = await store.getIdempotency(keyHash);
        const existing = winner ? await store.get(winner.orderId) : null;
        if (existing) return savedResponse(existing, true);
        throw new Error("Lost an idempotency race and couldn't find the winner.");
      }
    }

    // Signed in: keep the order in their history and empty their saved cart.
    // The order is already safe; a problem here must not fail it.
    if (userId) {
      try {
        await (await accountStore()).update(userId, (u) => ({
          ...u,
          orders: addOrder(u.orders, accountOrderFrom(order)),
          cart: [],
          updatedAt: new Date().toISOString(),
        }));
      } catch (err) {
        console.error("Couldn't add the order to the account history", err);
      }
    }

    return savedResponse(order);
  } catch (err) {
    console.error("Couldn't save the order", err);
    return fail(503, { ok: false, code: "storage_failed", message: "We couldn't save your order. Nothing was sent and your cart is safe: please try again in a moment." });
  }
}

// ---- request shape --------------------------------------------------------------

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isOrderRequest(value: unknown): value is OrderRequest {
  if (!isRecord(value)) return false;
  const { customer, items, expected, paymentMethod } = value;
  return (
    isRecord(customer) &&
    ["name", "phone", "email", "address", "city", "state", "pin"].every((k) => typeof customer[k] === "string") &&
    Array.isArray(items) &&
    items.length <= MAX_LINES &&
    items.every((i) => isRecord(i) && typeof i.id === "string" && Number.isInteger(i.qty) && (i.qty as number) >= 1 && (i.qty as number) <= MAX_QTY) &&
    isRecord(expected) &&
    Array.isArray(expected.lines) &&
    typeof expected.totalCents === "number" &&
    typeof paymentMethod === "string" &&
    PAYMENT_OPTIONS.some((o) => o.id === paymentMethod)
  );
}
