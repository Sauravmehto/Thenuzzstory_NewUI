import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { normalizeEmail, validateSignIn, validateSignUp } from "@/lib/account-types";
import { PRODUCTS } from "@/lib/catalog";

// The file store and the dev auth secret live under process.cwd()/.data: point it at a temp dir.
let root: string;
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "nuzz-accounts-"));
  vi.spyOn(process, "cwd").mockReturnValue(root);
  process.env.ACCOUNT_STORE = "file";
});
afterAll(async () => {
  vi.restoreAllMocks();
  delete process.env.ACCOUNT_STORE;
  await rm(root, { recursive: true, force: true });
});

const user = (over: Record<string, unknown> = {}) => ({
  id: "0123456789abcdef0123456789abcdef",
  email: "jane@example.com",
  name: "Jane Doe",
  passwordHash: "x",
  sessionVersion: 1,
  createdAt: "2026-10-13T00:00:00.000Z",
  updatedAt: "2026-10-13T00:00:00.000Z",
  cart: [],
  wishlist: [],
  orders: [],
  ...over,
});

describe("validation", () => {
  it("checks sign-up fields", () => {
    expect(validateSignUp({ name: " Jane   Doe ", email: " Jane@Example.COM ", password: "walkies12" })).toEqual({
      errors: {},
      value: { name: "Jane Doe", email: "jane@example.com", password: "walkies12" },
    });
    const bad = validateSignUp({ name: "J", email: "nope", password: "short" }).errors;
    expect(Object.keys(bad).sort()).toEqual(["email", "name", "password"]);
    expect(validateSignUp({ name: "Jane", email: "j@x.io", password: "onlyletters" }).errors.password).toMatch(/number/);
  });

  it("checks sign-in fields and normalizes email", () => {
    expect(validateSignIn({ email: "a@b.co", password: "" }).errors.password).toBeTruthy();
    expect(normalizeEmail("  Mixed@Case.IN ")).toBe("mixed@case.in");
  });
});

describe("passwords and sessions", () => {
  it("hashes with a salt and verifies only the right password", async () => {
    const { hashPassword, verifyPassword } = await import("@/lib/server/auth");
    const a = await hashPassword("walkies12");
    const b = await hashPassword("walkies12");
    expect(a).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(a).not.toBe(b); // different salt each time
    expect(a).not.toContain("walkies12");
    expect(await verifyPassword("walkies12", a)).toBe(true);
    expect(await verifyPassword("walkies13", a)).toBe(false);
    expect(await verifyPassword("walkies12", "garbage")).toBe(false);
  });

  it("signs session cookies and rejects tampering, expiry and old versions", async () => {
    const { createSessionToken, sessionUser } = await import("@/lib/server/auth");
    const { accountStore } = await import("@/lib/server/account-store");
    const store = await accountStore();
    const u = user({ id: "a".repeat(32), email: "session@example.com" });
    await store.create(u);
    const req = (token: string) => ({ cookies: { get: () => ({ value: token }) } }) as never;

    const token = createSessionToken(u)!;
    expect((await sessionUser(req(token)))?.email).toBe("session@example.com");

    const tampered = token.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    expect(await sessionUser(req(tampered))).toBeNull();
    const forged = token.replace("a".repeat(32), "b".repeat(32));
    expect(await sessionUser(req(forged))).toBeNull();
    expect(await sessionUser(req(createSessionToken(u, Date.now() - 31 * 86400_000)!))).toBeNull();

    await store.update(u.id, (x) => ({ ...x, sessionVersion: 2 })); // "sign out everywhere"
    expect(await sessionUser(req(token))).toBeNull();
  });
});

describe("account store (files)", () => {
  it("refuses a second account with the same email", async () => {
    const { accountStore } = await import("@/lib/server/account-store");
    const store = await accountStore();
    expect(await store.create(user({ id: "c".repeat(32), email: "dup@example.com" }))).toBe(true);
    expect(await store.create(user({ id: "d".repeat(32), email: "dup@example.com" }))).toBe(false);
    expect(await store.findIdByEmail("dup@example.com")).toBe("c".repeat(32));
  });

  it("never writes the email or password in plain text into the index", async () => {
    const files = await readdir(path.join(root, ".data", "accounts", "emails"));
    expect(files.join(" ")).not.toContain("@");
    const raw = await readFile(path.join(root, ".data", "accounts", "users", `${"c".repeat(32)}.json`), "utf8");
    expect(raw).not.toContain("walkies");
  });
});

describe("cart and wishlist cleaning", () => {
  const pack = PRODUCTS.find((p) => p.variants?.length)!;
  const sku = pack.variants![0]!.sku;
  const stock = pack.variants![0]!.stock;

  it("keeps only buyable lines, merges duplicates and clamps to stock", async () => {
    const { cleanCart } = await import("@/lib/server/account-data");
    expect(
      cleanCart([
        { id: sku, qty: 2 },
        { id: sku, qty: 3 },
        { id: pack.id, qty: 1 }, // the product itself isn't sold, only its packs
        { id: "not-a-product", qty: 1 },
        { id: sku, qty: Number.NaN },
        "junk",
      ]),
    ).toEqual([{ id: sku, qty: 5 }]);
    expect(cleanCart([{ id: sku, qty: 10_000 }])).toEqual([{ id: sku, qty: Math.min(stock, 99) }]);
  });

  it("merges a guest cart and wishlist into the account", async () => {
    const { mergeIntoUser } = await import("@/lib/server/account-data");
    const merged = mergeIntoUser(user({ cart: [{ id: sku, qty: 1 }], wishlist: [pack.id] }) as never, {
      cart: [{ id: sku, qty: 2 }],
      wishlist: [pack.id, "fake", PRODUCTS[1]!.id],
    });
    expect(merged.cart).toEqual([{ id: sku, qty: 3 }]);
    expect(merged.wishlist).toEqual([pack.id, PRODUCTS[1]!.id]);
  });

  it("records orders newest first without duplicates", async () => {
    const { addOrder } = await import("@/lib/server/account-data");
    const o = (id: string) => ({ orderId: id, placedAt: "", lines: [], subtotalCents: 0, shippingCents: 0, totalCents: 0, payment: "whatsapp" as const, city: "" });
    expect(addOrder([o("A")], o("B")).map((x) => x.orderId)).toEqual(["B", "A"]);
    expect(addOrder([o("B"), o("A")], o("B")).map((x) => x.orderId)).toEqual(["B", "A"]);
  });
});

describe("merging changes made while the account loads", () => {
  it("keeps what the customer just added instead of overwriting it", async () => {
    const { mergeCartMax, unionIds } = await import("@/lib/account-merge");
    expect(mergeCartMax([{ id: "a", qty: 2 }], [{ id: "b", qty: 1 }])).toEqual([{ id: "a", qty: 2 }, { id: "b", qty: 1 }]);
    // The same items on both sides are NOT doubled.
    expect(mergeCartMax([{ id: "a", qty: 2 }], [{ id: "a", qty: 2 }])).toEqual([{ id: "a", qty: 2 }]);
    expect(mergeCartMax([{ id: "a", qty: 2 }], [{ id: "a", qty: 3 }])).toEqual([{ id: "a", qty: 3 }]);
    expect(unionIds(["x", "y"], ["y", "z"])).toEqual(["x", "y", "z"]);
  });
});
