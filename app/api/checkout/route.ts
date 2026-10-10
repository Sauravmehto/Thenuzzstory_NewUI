import { NextResponse, type NextRequest } from "next/server";
import { buildQuote, diffQuotes } from "@/lib/pricing";
import { getServerProduct } from "@/lib/server/catalog";
import { readDemo, sleep } from "@/lib/server/demo";
import type { CheckoutRequest, CheckoutResponse, Payment } from "@/lib/types";
import { validateCustomer, type CustomerErrors } from "@/lib/validation";

/*
 * Idempotency: the client sends an Idempotency-Key per order attempt, so a
 * double-click or a retry after a flaky network returns the SAME order instead
 * of creating two. This in-memory map is fine for a demo; in production it
 * would live in a shared store (Redis/DB) with a TTL, because serverless
 * instances don't share memory.
 */
const completedOrders = new Map<string, CheckoutResponse>();

export async function POST(req: NextRequest) {
  const demo = readDemo(req);
  await sleep(demo.latencyMs);

  const idempotencyKey = req.headers.get("idempotency-key");
  if (idempotencyKey) {
    const previous = completedOrders.get(idempotencyKey);
    if (previous) {
      return NextResponse.json(previous, { headers: { "idempotent-replay": "true" } });
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  if (!isCheckoutRequest(body)) {
    return NextResponse.json<CheckoutResponse>(
      { ok: false, code: "invalid_request", message: "Invalid request body." },
      { status: 400 },
    );
  }

  const errors: CustomerErrors & { items?: string } = validateCustomer(body.customer);
  if (body.items.length === 0) errors.items = "Your cart is empty.";
  if (Object.keys(errors).length > 0) {
    return NextResponse.json<CheckoutResponse>(
      { ok: false, code: "validation", errors },
      { status: 422 },
    );
  }

  // Re-price from the server's catalog. The client never tells us a price;
  // it only tells us what it *showed*, so we can detect a stale quote.
  const quote = buildQuote(body.items, (id) => getServerProduct(id, demo));
  if (quote.lines.length === 0) {
    return NextResponse.json<CheckoutResponse>(
      { ok: false, code: "empty_cart", message: "Nothing in your cart is available any more." },
      { status: 409 },
    );
  }

  const changes = diffQuotes(body.expected.lines, quote);
  if (changes.length > 0 || quote.totalCents !== body.expected.totalCents) {
    // Never silently charge a different amount: hand the new quote back for review.
    return NextResponse.json<CheckoutResponse>(
      { ok: false, code: "quote_changed", quote, changes },
      { status: 409 },
    );
  }

  const payment: Payment = body.payment ?? { method: "card" };
  if (payment.method === "wallet" && !isWalletPayment(payment)) {
    return NextResponse.json<CheckoutResponse>(
      { ok: false, code: "payment_invalid", message: "We couldn't verify that wallet payment." },
      { status: 402 },
    );
  }
  // A real integration would verify the transaction on-chain here (amount,
  // recipient, confirmations) before fulfilling. This demo only checks shape.

  const orderId = `CP-${Date.now().toString(36).toUpperCase()}`;
  const response: CheckoutResponse = {
    ok: true,
    orderId,
    quote,
    payment,
    message: `Order ${orderId} confirmed! A (pretend) confirmation email is on its way.`,
  };
  if (idempotencyKey) completedOrders.set(idempotencyKey, response);
  return NextResponse.json(response);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWalletPayment(p: Payment): boolean {
  return (
    p.method === "wallet" &&
    /^0x[0-9a-f]{40}$/i.test(p.account) &&
    /^0x[0-9a-f]{64}$/i.test(p.txHash)
  );
}

function isCheckoutRequest(value: unknown): value is CheckoutRequest {
  if (!isRecord(value)) return false;
  const { customer, items, expected } = value;
  return (
    isRecord(customer) &&
    ["name", "email", "address", "city", "zip"].every((k) => typeof customer[k] === "string") &&
    Array.isArray(items) &&
    items.every((i) => isRecord(i) && typeof i.id === "string" && Number.isInteger(i.qty)) &&
    isRecord(expected) &&
    Array.isArray(expected.lines) &&
    typeof expected.totalCents === "number"
  );
}
