import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AccountOrder } from "@/lib/account-types";
import type { CartLine } from "@/lib/types";
import { dataDir } from "./data-dir";

/**
 * Customer accounts. One record per user; the email index maps a normalized
 * email to the user id and is created with "only if new", so two sign-ups
 * can't claim the same address.
 *
 * Two implementations behind one interface:
 * - Netlify Blobs on Netlify (no setup: the site's own store), chosen
 *   automatically there or with ACCOUNT_STORE=blobs.
 * - JSON files in .data/accounts for local development (git-ignored).
 */
export interface StoredUser {
  id: string;
  email: string;
  name: string;
  /** scrypt$N$r$p$salt$hash (see lib/server/auth.ts). Never sent to the browser. */
  passwordHash: string;
  /** Bumped to sign out every existing session (e.g. after a password change). */
  sessionVersion: number;
  createdAt: string;
  updatedAt: string;
  cart: CartLine[];
  wishlist: string[];
  orders: AccountOrder[];
}

export interface AccountStore {
  get(id: string): Promise<StoredUser | null>;
  findIdByEmail(email: string): Promise<string | null>;
  /** False when the email is already registered. */
  create(user: StoredUser): Promise<boolean>;
  /** Read-modify-write with a conflict check; retried when another request wrote first. */
  update(id: string, mutate: (user: StoredUser) => StoredUser): Promise<StoredUser | null>;
}

const emailKey = (email: string) => createHash("sha256").update(email).digest("hex");
const MAX_RETRIES = 5;

// ---- Netlify Blobs ------------------------------------------------------------

async function blobsStore(): Promise<AccountStore> {
  const { getStore } = await import("@netlify/blobs");
  // Strong consistency: a sign-in right after sign-up must see the new account.
  const store = getStore({ name: "accounts", consistency: "strong" });
  const userKey = (id: string) => `users/${id}`;

  const read = async (id: string) => {
    const res = await store.getWithMetadata(userKey(id), { type: "json" });
    return res ? { user: res.data as StoredUser, etag: res.etag } : null;
  };

  return {
    async get(id) {
      return (await read(id))?.user ?? null;
    },
    async findIdByEmail(email) {
      const hit = (await store.get(`emails/${emailKey(email)}`, { type: "json" })) as { id?: string } | null;
      return hit?.id ?? null;
    },
    async create(user) {
      const claim = await store.setJSON(`emails/${emailKey(user.email)}`, { id: user.id }, { onlyIfNew: true });
      if (!claim.modified) return false;
      await store.setJSON(userKey(user.id), user, { onlyIfNew: true });
      return true;
    },
    async update(id, mutate) {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const current = await read(id);
        if (!current) return null;
        const next = mutate(structuredClone(current.user));
        const res = await store.setJSON(userKey(id), next, current.etag ? { onlyIfMatch: current.etag } : {});
        if (res.modified) return next;
      }
      throw new Error("The account is busy, try again.");
    },
  };
}

// ---- Local files (development) ---------------------------------------------------

function fileStore(): AccountStore {
  const dir = path.join(dataDir(), "accounts");
  const userFile = (id: string) => path.join(dir, "users", `${id}.json`);
  const emailFile = (email: string) => path.join(dir, "emails", `${emailKey(email)}.json`);
  // One process (the dev server): a promise chain is enough to serialize writes.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  const readJson = async <T>(file: string): Promise<T | null> => {
    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  };
  const writeAtomic = async (file: string, data: unknown) => {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2));
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmp, file);
        return;
      } catch (err) {
        // Windows: the file can be briefly locked by a watcher or antivirus.
        if (attempt >= 10 || !["EPERM", "EACCES", "EBUSY"].includes((err as NodeJS.ErrnoException).code ?? "")) {
          await rm(tmp, { force: true });
          throw err;
        }
        await new Promise((r) => setTimeout(r, 30 * (attempt + 1)));
      }
    }
  };

  return {
    get: (id) => readJson<StoredUser>(userFile(id)),
    async findIdByEmail(email) {
      return (await readJson<{ id: string }>(emailFile(email)))?.id ?? null;
    },
    create: (user) =>
      serial(async () => {
        await mkdir(path.dirname(emailFile(user.email)), { recursive: true });
        try {
          await writeFile(emailFile(user.email), JSON.stringify({ id: user.id }), { flag: "wx" });
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
          throw err;
        }
        await writeAtomic(userFile(user.id), user);
        return true;
      }),
    update: (id, mutate) =>
      serial(async () => {
        const current = await readJson<StoredUser>(userFile(id));
        if (!current) return null;
        const next = mutate(current);
        await writeAtomic(userFile(id), next);
        return next;
      }),
  };
}

// ---- selection ----------------------------------------------------------------------

export type StoreKind = "blobs" | "file";

export function accountStoreKind(): StoreKind {
  const forced = process.env.ACCOUNT_STORE;
  if (forced === "blobs" || forced === "file") return forced;
  // Netlify sets these for functions (Blobs context) and builds.
  const onNetlify =
    Boolean(process.env.NETLIFY_BLOBS_CONTEXT) ||
    Boolean((globalThis as { netlifyBlobsContext?: unknown }).netlifyBlobsContext) ||
    process.env.NETLIFY === "true";
  return onNetlify ? "blobs" : "file";
}

let cached: Promise<AccountStore> | null = null;

export function accountStore(): Promise<AccountStore> {
  cached ??= accountStoreKind() === "blobs" ? blobsStore() : Promise.resolve(fileStore());
  return cached;
}
