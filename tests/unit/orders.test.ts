import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PRODUCTS } from "@/lib/catalog";
import { formatPrice } from "@/lib/money";
import { buildQuote } from "@/lib/pricing";
import { buildWhatsappMessage, whatsappUrl } from "@/lib/whatsapp-order";
import type { SavedOrder } from "@/lib/order-types";
import type { OrderResponse } from "@/lib/types";
import { cleanCustomer, normalizePhone, validateCustomer } from "@/lib/validation";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "nuzz-orders-"));
  process.env.DATA_DIR = dir;
  process.env.ACCOUNT_STORE = "file";
  process.env.AUTH_SECRET = "unit-test-secret-0123456789-0123456789";
});
afterAll(async () => {
  delete process.env.DATA_DIR;
  delete process.env.ACCOUNT_STORE;
  delete process.env.AUTH_SECRET;
  await rm(dir, { recursive: true, force: true });
});

const pack = PRODUCTS.find((p) => p.variants?.length)!;
const sku = pack.variants![0]!;
const customer = {
  name: "Priya Sharma",
  phone: "98765 43210",
  email: "Priya@Example.com",
  address: "12 Maple Street, Hauz Khas",
  city: "New Delhi",
  state: "Delhi",
  pin: "110016",
};

/** What the browser would have been shown for one pack. */
const shown = (qty: number) => buildQuote([{ id: sku.sku, qty }], (id) => (id === sku.sku ? { ...pack, id: sku.sku, name: `${pack.name} · ${sku.label}`, priceCents: sku.priceCents, stock: sku.stock } : undefined));

async function post(over: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const { POST } = await import("@/app/api/orders/route");
  const quote = shown(2);
  const body = {
    customer,
    items: [{ id: sku.sku, qty: 2 }],
    expected: { lines: quote.lines, totalCents: quote.totalCents },
    paymentMethod: "whatsapp",
    ...over,
  };
  const res = await POST(
    new NextRequest("http://localhost:3000/api/orders", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as OrderResponse };
}

describe("checkout validation", () => {
  it("accepts every common way of writing an Indian mobile number", () => {
    for (const ok of ["9876543210", "98765 43210", "+91 98765 43210", "+91-98765-43210", "098765 43210", "(98765) 43210"])
      expect(normalizePhone(ok)).toBe("9876543210");
    for (const bad of ["5876543210", "98765", "12345678901", "abcdefghij", "+1 415 555 0100", ""]) expect(normalizePhone(bad)).toBeNull();
  });

  it("requires every field", () => {
    const empty = { name: "", phone: "", email: "", address: "", city: "", state: "", pin: "" };
    expect(Object.keys(validateCustomer(empty)).sort()).toEqual(["address", "city", "email", "name", "phone", "pin", "state"]);
    expect(validateCustomer(customer)).toEqual({});
  });

  it("checks email, PIN code and state", () => {
    expect(validateCustomer({ ...customer, email: "nope" }).email).toMatch(/valid email/);
    for (const pin of ["11001", "1100160", "011007", "ABCDEF"]) expect(validateCustomer({ ...customer, pin }).pin).toMatch(/6-digit/);
    expect(validateCustomer({ ...customer, pin: "110 016" }).pin).toBeUndefined();
    expect(validateCustomer({ ...customer, state: "Atlantis" }).state).toBeTruthy();
    expect(validateCustomer({ ...customer, address: "Delhi" }).address).toMatch(/complete address/);
  });

  it("saves a tidy copy: 10-digit phone, lower-case email, no stray spaces", () => {
    expect(cleanCustomer({ ...customer, name: "  Priya   Sharma ", pin: "110 016" })).toMatchObject({
      name: "Priya Sharma",
      phone: "9876543210",
      email: "priya@example.com",
      pin: "110016",
    });
  });
});

describe("WhatsApp message", () => {
  const order: SavedOrder = {
    orderId: "NS-261014-7KQ3XM",
    createdAt: "2026-10-14T09:30:00.000Z",
    status: "pending_confirmation",
    paymentStatus: "payment_pending",
    paymentMethod: "whatsapp",
    customer: cleanCustomer({ ...customer, address: "Flat 4B, Rose & Co. Apartments\nMG Road (near the café)" }),
    lines: [{ id: "x--70g", productId: "x", name: "PREY Anchovies · 70 g", packLabel: "70 g", qty: 2, unitCents: 31000, lineCents: 62000 }],
    subtotalCents: 62000,
    shippingCents: 7900,
    totalCents: 69900,
    currency: "INR",
    source: "web",
  };

  it("has everything the team needs", () => {
    const msg = buildWhatsappMessage(order);
    for (const part of [
      "NS-261014-7KQ3XM",
      "Priya Sharma",
      "+91 98765 43210",
      "Flat 4B, Rose & Co. Apartments",
      "New Delhi, Delhi 110016",
      "PREY Anchovies (70 g) × 2",
      formatPrice(31000),
      formatPrice(62000),
      `Total: ${formatPrice(69900)}`,
      "Payment method: WhatsApp",
      "pending",
    ])
      expect(msg).toContain(part);
    expect(msg).not.toContain("@"); // the email isn't needed in the chat
  });

  it("is encoded for the official click-to-chat link and survives a round trip", () => {
    const url = whatsappUrl(buildWhatsappMessage(order));
    expect(url.startsWith("https://wa.me/918130699818?text=")).toBe(true);
    expect(url).not.toMatch(/[\s"<>]/);
    const text = new URL(url).searchParams.get("text")!;
    expect(text).toBe(buildWhatsappMessage(order));
    expect(text).toContain("Rose & Co."); // "&" must not cut the message short
    expect(text).toContain("café");
  });
});

describe("POST /api/orders", () => {
  it("saves the order FIRST, then returns a WhatsApp link built from what was saved", async () => {
    const { status, body } = await post();
    expect(status).toBe(200);
    if (!body.ok) throw new Error("expected ok");
    expect(body.orderId).toMatch(/^NS-\d{6}-[2-9A-HJ-NP-Z]{6}$/);
    expect(body.status).toBe("pending_confirmation");
    expect(body.paymentStatus).toBe("payment_pending");
    expect(body.paymentMethod).toBe("whatsapp");
    expect(body.quote.totalCents).toBe(shown(2).totalCents);
    expect(body.whatsappUrl.startsWith("https://wa.me/918130699818?text=")).toBe(true);
    expect(body.whatsappMessage).toContain(body.orderId);

    const saved = JSON.parse(await readFile(path.join(dir, "orders", `${body.orderId}.json`), "utf8")) as SavedOrder;
    expect(saved).toMatchObject({
      orderId: body.orderId,
      status: "pending_confirmation",
      paymentStatus: "payment_pending",
      paymentMethod: "whatsapp",
      totalCents: body.quote.totalCents,
      customer: { name: "Priya Sharma", phone: "9876543210", email: "priya@example.com", state: "Delhi", pin: "110016" },
    });
    expect(saved.lines).toEqual([
      expect.objectContaining({ id: sku.sku, productId: pack.id, packLabel: sku.label, qty: 2, unitCents: sku.priceCents, lineCents: sku.priceCents * 2 }),
    ]);
    expect(saved.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("prices on the server: a forged price or total is never saved", async () => {
    const forged = { lines: [{ id: sku.sku, name: "x", qty: 2, unitCents: 100, lineCents: 200 }], totalCents: 200 };
    const { status, body } = await post({ expected: forged });
    expect(status).toBe(409);
    expect(body).toMatchObject({ ok: false, code: "quote_changed" });
    if (body.ok || body.code !== "quote_changed") throw new Error("expected quote_changed");
    expect(body.quote.totalCents).toBe(shown(2).totalCents); // the real price comes back instead
    const files = (await readdir(path.join(dir, "orders"))).filter((f) => f.endsWith(".json"));
    for (const f of files) expect(JSON.parse(await readFile(path.join(dir, "orders", f), "utf8")).totalCents).not.toBe(200);
  });

  it("ignores the demo cookie on the live store: nobody can pick their own price", async () => {
    const cookie = encodeURIComponent(JSON.stringify({ latencyMs: 0, failNextCart: false, priceBump: { id: sku.sku, percent: -90 } }));

    // In development / the test build the controls work (that is what the demo panel is for)...
    const demo = await post({}, { cookie: `cp-demo=${cookie}` });
    expect(demo.body).toMatchObject({ ok: false, code: "quote_changed" });

    // ...on a live store (production, no demo profile) the same cookie does nothing.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_STORE_PROFILE", "");
    try {
      const live = await post({}, { cookie: `cp-demo=${cookie}` });
      expect(live.status).toBe(200);
      expect(live.body.ok && live.body.quote.totalCents).toBe(shown(2).totalCents);
      expect(live.body.ok && live.body.quote.lines[0]!.unitCents).toBe(sku.priceCents);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects bad details without saving anything", async () => {
    const before = (await readdir(path.join(dir, "orders"))).length;
    const { status, body } = await post({ customer: { ...customer, phone: "123", pin: "12", email: "x" } });
    expect(status).toBe(422);
    expect(body).toMatchObject({ ok: false, code: "validation" });
    if (!body.ok && body.code === "validation") expect(Object.keys(body.errors).sort()).toEqual(["email", "phone", "pin"]);
    expect((await readdir(path.join(dir, "orders"))).length).toBe(before);
  });

  it("rejects an empty cart, unknown products, drafts and other payment methods", async () => {
    expect((await post({ items: [] })).body).toMatchObject({ ok: false, code: "validation" });
    expect((await post({ items: [{ id: "not-a-product", qty: 1 }] })).body).toMatchObject({ ok: false, code: "empty_cart" });
    expect((await post({ items: [{ id: pack.id, qty: 1 }] })).body).toMatchObject({ ok: false, code: "empty_cart" }); // packs only
    expect((await post({ paymentMethod: "card" })).body).toMatchObject({ ok: false, code: "invalid_request" });
    expect((await post({ items: [{ id: sku.sku, qty: 0 }] })).body).toMatchObject({ ok: false, code: "invalid_request" });
  });

  it("blocks requests from other websites", async () => {
    const { status } = await post({}, { origin: "https://evil.example" });
    expect(status).toBe(403);
  });

  it("repeating the same click returns the SAME order, not a second one", async () => {
    const key = { "idempotency-key": "dbl-click-0001-aaaaaaaa" };
    const before = (await readdir(path.join(dir, "orders"))).filter((f) => f.endsWith(".json")).length;
    const [a, b] = await Promise.all([post({}, key), post({}, key)]);
    const c = await post({}, key);
    for (const r of [a, b, c]) expect(r.status).toBe(200);
    const ids = new Set([a, b, c].map((r) => (r.body.ok ? r.body.orderId : "")));
    expect(ids.size).toBe(1);
    expect(c.body.ok && c.body.replay).toBe(true);
    const after = (await readdir(path.join(dir, "orders"))).filter((f) => f.endsWith(".json")).length;
    expect(after - before).toBe(1);
  });

  it("refuses a key that is reused for a different order", async () => {
    const key = { "idempotency-key": "reuse-key-0002-bbbbbbbb" };
    expect((await post({}, key)).status).toBe(200);
    const other = await post({ customer: { ...customer, address: "99 Another Road, Saket" } }, key);
    expect(other.status).toBe(409);
    expect(other.body).toMatchObject({ ok: false, code: "idempotency_conflict" });
  });

  it("when saving fails: no success, no WhatsApp link, and an actionable message", async () => {
    const store = await import("@/lib/server/order-store");
    const spy = vi.spyOn(await store.orderStore(), "create").mockRejectedValue(new Error("disk full"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { status, body } = await post();
      expect(status).toBe(503);
      expect(body).toMatchObject({ ok: false, code: "storage_failed" });
      expect(JSON.stringify(body)).not.toContain("wa.me");
      if (!body.ok && "message" in body) expect(body.message).toMatch(/cart is safe/i);
    } finally {
      spy.mockRestore();
      log.mockRestore();
    }
  });

  it("every saved order id is unique", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => post()));
    const ids = results.map((r) => (r.body.ok ? r.body.orderId : ""));
    expect(new Set(ids).size).toBe(8);
  });
});
