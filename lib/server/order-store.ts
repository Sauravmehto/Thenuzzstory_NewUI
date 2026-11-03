import "server-only";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SavedOrder } from "@/lib/order-types";
import { accountStoreKind } from "./account-store";
import { dataDir } from "./data-dir";
import { ORDER_ID_RE } from "./orders";

/**
 * Orders live in a store of their own, with the same two backends as accounts:
 * Netlify Blobs when deployed (nothing to set up), local files in
 * .data/orders (git-ignored) otherwise.
 *
 * Both writes below are "only if new", which is what makes duplicate
 * submissions safe: an order id can never be reused, and an idempotency key
 * can only ever point to one order.
 */
export interface IdempotencyRecord {
  orderId: string;
  /** Hash of what the key was first used for. Same key + different request = conflict. */
  fingerprint: string;
  createdAt: string;
}

export interface OrderStore {
  /** False when an order with this id already exists (nothing was written). */
  create(order: SavedOrder): Promise<boolean>;
  get(orderId: string): Promise<SavedOrder | null>;
  remove(orderId: string): Promise<void>;
  /** Every saved order, newest first (for the admin). */
  list(): Promise<SavedOrder[]>;
  /** Replaces an existing order (admin status changes). False when it doesn't exist. */
  update(order: SavedOrder): Promise<boolean>;
  getIdempotency(keyHash: string): Promise<IdempotencyRecord | null>;
  /** False when the key is already claimed. */
  claimIdempotency(keyHash: string, record: IdempotencyRecord): Promise<boolean>;
  releaseIdempotency(keyHash: string): Promise<void>;
}

const newestFirst = (orders: SavedOrder[]) => orders.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** Keys are hashed before they're used as names, so a client can't pick a path or a blob name. */
export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

async function blobsOrderStore(): Promise<OrderStore> {
  const { getStore } = await import("@netlify/blobs");
  const store = getStore({ name: "orders", consistency: "strong" });
  const orderKey = (id: string) => `orders/${id}`;
  const idemKey = (hash: string) => `idempotency/${hash}`;

  return {
    async create(order) {
      return (await store.setJSON(orderKey(order.orderId), order, { onlyIfNew: true })).modified;
    },
    async get(orderId) {
      return ((await store.get(orderKey(orderId), { type: "json" })) as SavedOrder | null) ?? null;
    },
    async remove(orderId) {
      await store.delete(orderKey(orderId));
    },
    async list() {
      const { blobs } = await store.list({ prefix: "orders/" });
      const all = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" }) as Promise<SavedOrder | null>));
      return newestFirst(all.filter((o): o is SavedOrder => !!o));
    },
    async update(order) {
      if (!(await store.get(orderKey(order.orderId)))) return false;
      await store.setJSON(orderKey(order.orderId), order);
      return true;
    },
    async getIdempotency(hash) {
      return ((await store.get(idemKey(hash), { type: "json" })) as IdempotencyRecord | null) ?? null;
    },
    async claimIdempotency(hash, record) {
      return (await store.setJSON(idemKey(hash), record, { onlyIfNew: true })).modified;
    },
    async releaseIdempotency(hash) {
      await store.delete(idemKey(hash));
    },
  };
}

function fileOrderStore(): OrderStore {
  const dir = path.join(dataDir(), "orders");
  const orderFile = (id: string) => {
    // Order ids come from us, but check anyway: this value becomes a file name.
    if (!ORDER_ID_RE.test(id)) throw new Error("Invalid order id.");
    return path.join(dir, `${id}.json`);
  };
  const idemFile = (hash: string) => path.join(dir, "idempotency", `${hash}.json`);
  const readJson = async <T>(file: string): Promise<T | null> => {
    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  };
  /** "wx": fails instead of overwriting, the file-system version of onlyIfNew. */
  const writeNew = async (file: string, data: unknown) => {
    await mkdir(path.dirname(file), { recursive: true });
    try {
      await writeFile(file, JSON.stringify(data, null, 2), { flag: "wx" });
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw err;
    }
  };

  return {
    create: (order) => writeNew(orderFile(order.orderId), order),
    get: (id) => readJson<SavedOrder>(orderFile(id)),
    remove: (id) => rm(orderFile(id), { force: true }),
    async list() {
      let names: string[] = [];
      try {
        names = await readdir(dir);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
      const all = await Promise.all(
        names.filter((n) => n.endsWith(".json")).map((n) => readJson<SavedOrder>(path.join(dir, n))),
      );
      return newestFirst(all.filter((o): o is SavedOrder => !!o));
    },
    async update(order) {
      const file = orderFile(order.orderId);
      if (!(await readJson<SavedOrder>(file))) return false;
      await writeFile(file, JSON.stringify(order, null, 2));
      return true;
    },
    getIdempotency: (hash) => readJson<IdempotencyRecord>(idemFile(hash)),
    claimIdempotency: (hash, record) => writeNew(idemFile(hash), record),
    releaseIdempotency: (hash) => rm(idemFile(hash), { force: true }),
  };
}

let cached: Promise<OrderStore> | null = null;

export function orderStore(): Promise<OrderStore> {
  cached ??= accountStoreKind() === "blobs" ? blobsOrderStore() : Promise.resolve(fileOrderStore());
  return cached;
}
