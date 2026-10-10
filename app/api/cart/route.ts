import { NextResponse, type NextRequest } from "next/server";
import { getServerProduct } from "@/lib/server/catalog";
import { DEMO_COOKIE, readDemo, serializeDemo, sleep } from "@/lib/server/demo";
import type { CartUpdateResponse } from "@/lib/types";

/**
 * Validates one cart change against live stock.
 *
 * The client applies the change optimistically and calls this in the
 * background. The client always sends the ABSOLUTE quantity it wants (not +1),
 * so a retried or reordered request can't double-count.
 */
export async function POST(req: NextRequest) {
  const demo = readDemo(req);
  await sleep(demo.latencyMs);

  if (demo.failNextCart) {
    const res = NextResponse.json<CartUpdateResponse>(
      { ok: false, code: "unavailable", message: "Couldn't reach the store. Your cart wasn't changed." },
      { status: 503 },
    );
    res.cookies.set(DEMO_COOKIE, serializeDemo({ ...demo, failNextCart: false }), { path: "/" });
    return res;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  if (!isCartUpdate(body)) {
    return NextResponse.json<CartUpdateResponse>(
      { ok: false, code: "invalid_request", message: "Invalid cart update." },
      { status: 400 },
    );
  }

  const product = getServerProduct(body.id, demo);
  if (!product) {
    return NextResponse.json<CartUpdateResponse>(
      { ok: false, code: "unknown_product", available: 0, message: "That item is no longer sold." },
      { status: 404 },
    );
  }

  if (body.qty > product.stock) {
    return NextResponse.json<CartUpdateResponse>(
      {
        ok: false,
        code: "insufficient_stock",
        available: product.stock,
        message:
          product.stock === 0
            ? `${product.name} just sold out.`
            : `Only ${product.stock} left of “${product.name}”, so we've updated your cart.`,
      },
      { status: 409 },
    );
  }

  return NextResponse.json<CartUpdateResponse>({
    ok: true,
    line: { id: product.id, qty: body.qty },
    stock: product.stock,
  });
}

function isCartUpdate(value: unknown): value is { id: string; qty: number } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.qty === "number" &&
    Number.isInteger(v.qty) &&
    v.qty >= 0 &&
    v.qty <= 99
  );
}
