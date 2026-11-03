import "server-only";
import { NextResponse } from "next/server";
import type { AccountOrder, AccountSession } from "@/lib/account-types";
import { getProduct } from "@/lib/catalog";
import type { SavedOrder } from "@/lib/order-types";
import type { CartLine } from "@/lib/types";
import type { StoredUser } from "./account-store";
import { createSessionToken, sessionCookie } from "./auth";

const MAX_CART_LINES = 50;
const MAX_WISHLIST = 200;
const MAX_ORDERS = 50;
const MAX_QTY = 99;

/**
 * Keeps only lines the shop can sell right now (published packs / products),
 * merges duplicates and clamps to stock. The browser's copy is never trusted.
 */
export function cleanCart(input: unknown): CartLine[] {
  if (!Array.isArray(input)) return [];
  const qty = new Map<string, number>();
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) continue;
    const { id, qty: q } = raw as Record<string, unknown>;
    if (typeof id !== "string" || typeof q !== "number" || !Number.isFinite(q)) continue;
    const product = getProduct(id);
    // A product with pack sizes is only sold by pack; coming-soon items not at all.
    if (!product || product.comingSoon || product.variants?.length || product.stock <= 0) continue;
    const next = Math.min((qty.get(id) ?? 0) + Math.floor(q), product.stock, MAX_QTY);
    if (next > 0) qty.set(id, next);
  }
  return [...qty].slice(0, MAX_CART_LINES).map(([id, q]) => ({ id, qty: q }));
}

/** Product ids that still exist in the shop, without duplicates. */
export function cleanWishlist(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<string>();
  for (const id of input) if (typeof id === "string" && getProduct(id) && !id.includes("--")) out.add(id);
  return [...out].slice(0, MAX_WISHLIST);
}

/** Guest items join the account's: quantities add up (within stock), wishlists combine. */
export function mergeIntoUser(user: StoredUser, guest: { cart?: unknown; wishlist?: unknown }): StoredUser {
  return {
    ...user,
    cart: cleanCart([...user.cart, ...cleanCart(guest.cart)]),
    wishlist: cleanWishlist([...user.wishlist, ...cleanWishlist(guest.wishlist)]),
    updatedAt: new Date().toISOString(),
  };
}

export const sessionBody = (user: StoredUser): AccountSession => ({
  signedIn: true,
  profile: { name: user.name, email: user.email },
  // Re-cleaned on every read: prices, stock and the catalog may have changed.
  cart: cleanCart(user.cart),
  wishlist: cleanWishlist(user.wishlist),
});

/** Session JSON + the signed cookie. */
export function signedInResponse(user: StoredUser, status = 200) {
  const token = createSessionToken(user);
  const res = NextResponse.json({ ok: true, session: sessionBody(user) }, { status });
  if (token) res.cookies.set(sessionCookie(token));
  return res;
}

/** The slice of a saved order the customer sees in their account history. */
export function accountOrderFrom(order: SavedOrder): AccountOrder {
  return {
    orderId: order.orderId,
    placedAt: order.createdAt,
    lines: order.lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty, unitCents: l.unitCents, lineCents: l.lineCents })),
    subtotalCents: order.subtotalCents,
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    payment: order.paymentMethod,
    city: order.customer.city.slice(0, 80),
    status: order.status,
    paymentStatus: order.paymentStatus,
  };
}

/** Newest first, no duplicates (an idempotent retry returns the same order). */
export const addOrder = (orders: AccountOrder[], order: AccountOrder) =>
  [order, ...orders.filter((o) => o.orderId !== order.orderId)].slice(0, MAX_ORDERS);
