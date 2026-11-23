import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { accountStoreKind } from "./account-store";
import { dataDir } from "./data-dir";

/*
 * Storage for grooming: config (pricing, availability), content (videos,
 * gallery, testimonials), bookings, calendar claims and uploaded photos.
 *
 * Same two backends as orders and accounts: Netlify Blobs when deployed (store
 * "grooming", strong consistency), files under <DATA_DIR>/grooming locally.
 * Admin edits made on the live site are stored here, never in the repo.
 *
 * The primitives that make booking safe:
 *  - createJSON: "only if new" (Blobs onlyIfNew / file flag "wx"): exactly one
 *    writer can create a key. Calendar seats are claimed with this.
 *  - updateJSON: compare-and-swap with retry (Blobs onlyIfMatch etag), a
 *    serialized queue + atomic rename locally.
 */

export interface GroomingStore {
  readJSON<T>(key: string): Promise<T | null>;
  /** False when the key already exists (nothing was written). */
  createJSON(key: string, data: unknown): Promise<boolean>;
  writeJSON(key: string, data: unknown): Promise<void>;
  /** Read-modify-write without lost updates. `mutate` receives null when the key doesn't exist yet. */
  updateJSON<T>(key: string, mutate: (current: T | null) => T): Promise<T>;
  remove(key: string): Promise<void>;
  /** Keys under a prefix ending in "/". */
  listKeys(prefix: string): Promise<string[]>;
  readBinary(key: string): Promise<Buffer | null>;
  writeBinary(key: string, data: Buffer): Promise<void>;
}

const KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;
export const isValidKey = (key: string) => KEY_RE.test(key) && !key.split("/").includes("..") && key.length <= 300;
function assertKey(key: string) {
  if (!isValidKey(key)) throw new Error(`Invalid storage key: ${key}`);
}
function assertPrefix(prefix: string) {
  if (!prefix.endsWith("/") || !isValidKey(prefix.slice(0, -1))) throw new Error(`Invalid storage prefix: ${prefix}`);
}

const MAX_CAS_RETRIES = 8;

// ---- Netlify Blobs ----------------------------------------------------------------

async function blobsStore(): Promise<GroomingStore> {
  const { getStore } = await import("@netlify/blobs");
  const store = getStore({ name: "grooming", consistency: "strong" });
  return {
    async readJSON<T>(key: string) {
      assertKey(key);
      return ((await store.get(key, { type: "json" })) as T | null) ?? null;
    },
    async createJSON(key, data) {
      assertKey(key);
      return (await store.setJSON(key, data, { onlyIfNew: true })).modified;
    },
    async writeJSON(key, data) {
      assertKey(key);
      await store.setJSON(key, data);
    },
    async updateJSON<T>(key: string, mutate: (current: T | null) => T) {
      assertKey(key);
      for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
        const current = await store.getWithMetadata(key, { type: "json" });
        const next = mutate(current ? structuredClone(current.data as T) : null);
        const res = current?.etag
          ? await store.setJSON(key, next, { onlyIfMatch: current.etag })
          : await store.setJSON(key, next, { onlyIfNew: true });
        if (res.modified) return next;
      }
      throw new Error("That record is busy right now. Please try again.");
    },
    async remove(key) {
      assertKey(key);
      await store.delete(key);
    },
    async listKeys(prefix) {
      assertPrefix(prefix);
      const { blobs } = await store.list({ prefix });
      return blobs.map((b) => b.key);
    },
    async readBinary(key) {
      assertKey(key);
      const buf = (await store.get(key, { type: "arrayBuffer" })) as ArrayBuffer | null;
      return buf ? Buffer.from(buf) : null;
    },
    async writeBinary(key, data) {
      assertKey(key);
      await store.set(key, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
    },
  };
}

// ---- Local files -------------------------------------------------------------------

export function fileGroomingStore(root: string = path.join(dataDir(), "grooming")): GroomingStore {
  const fileOf = (key: string) => {
    assertKey(key);
    const full = path.join(root, ...key.split("/"));
    if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key.");
    return full;
  };
  // One process (the dev server): a promise chain serializes read-modify-write.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };
  const readText = async (file: string) => {
    try {
      return await readFile(file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  };
  const writeAtomic = async (file: string, data: string | Buffer) => {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${randomBytes(4).toString("hex")}.tmp`;
    await writeFile(tmp, data);
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmp, file);
        return;
      } catch (err) {
        // Windows: a watcher or antivirus can hold the file for a moment.
        if (attempt >= 10 || !["EPERM", "EACCES", "EBUSY"].includes((err as NodeJS.ErrnoException).code ?? "")) {
          await rm(tmp, { force: true });
          throw err;
        }
        await new Promise((r) => setTimeout(r, 30 * (attempt + 1)));
      }
    }
  };
  const walk = async (dir: string, keyPrefix: string): Promise<string[]> => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
    const out: string[] = [];
    for (const e of entries) {
      if (e.name.endsWith(".tmp")) continue;
      if (e.isDirectory()) out.push(...(await walk(path.join(dir, e.name), `${keyPrefix}${e.name}/`)));
      else out.push(`${keyPrefix}${e.name}`);
    }
    return out;
  };

  return {
    async readJSON<T>(key: string) {
      const raw = await readText(fileOf(key));
      return raw ? (JSON.parse(raw.toString("utf8")) as T) : null;
    },
    async createJSON(key, data) {
      const file = fileOf(key);
      await mkdir(path.dirname(file), { recursive: true });
      try {
        await writeFile(file, JSON.stringify(data, null, 2), { flag: "wx" });
        return true;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
        throw err;
      }
    },
    writeJSON: (key, data) => serial(() => writeAtomic(fileOf(key), JSON.stringify(data, null, 2))),
    updateJSON: <T>(key: string, mutate: (current: T | null) => T) =>
      serial(async () => {
        const file = fileOf(key);
        const raw = await readText(file);
        const next = mutate(raw ? (JSON.parse(raw.toString("utf8")) as T) : null);
        await writeAtomic(file, JSON.stringify(next, null, 2));
        return next;
      }),
    async remove(key) {
      await rm(fileOf(key), { force: true });
    },
    async listKeys(prefix) {
      assertPrefix(prefix);
      const dir = path.join(root, ...prefix.slice(0, -1).split("/"));
      const exists = await stat(dir).then((s) => s.isDirectory(), () => false);
      return exists ? walk(dir, prefix) : [];
    },
    readBinary: (key) => readText(fileOf(key)),
    writeBinary: (key, data) => writeAtomic(fileOf(key), data),
  };
}

// ---- In memory (unit tests) -----------------------------------------------------------

/**
 * Same semantics as Blobs, with an `await` before every operation so parallel
 * calls interleave the way concurrent requests would.
 */
export function memoryGroomingStore(jitter: () => Promise<void> = () => new Promise((r) => setTimeout(r, Math.random() * 3))): GroomingStore & {
  dump(): Map<string, unknown>;
} {
  const data = new Map<string, { value: unknown; etag: number }>();
  let etag = 0;
  return {
    dump: () => new Map([...data].map(([k, v]) => [k, v.value])),
    async readJSON<T>(key: string) {
      assertKey(key);
      await jitter();
      const hit = data.get(key);
      return hit ? (structuredClone(hit.value) as T) : null;
    },
    async createJSON(key, value) {
      assertKey(key);
      await jitter();
      if (data.has(key)) return false;
      data.set(key, { value: structuredClone(value), etag: ++etag });
      return true;
    },
    async writeJSON(key, value) {
      assertKey(key);
      await jitter();
      data.set(key, { value: structuredClone(value), etag: ++etag });
    },
    async updateJSON<T>(key: string, mutate: (current: T | null) => T) {
      assertKey(key);
      for (let attempt = 0; attempt < MAX_CAS_RETRIES * 4; attempt++) {
        await jitter();
        const hit = data.get(key);
        const next = mutate(hit ? (structuredClone(hit.value) as T) : null);
        await jitter();
        const now = data.get(key);
        if ((hit === undefined && now === undefined) || (hit && now && hit.etag === now.etag)) {
          data.set(key, { value: structuredClone(next), etag: ++etag });
          return next;
        }
      }
      throw new Error("busy");
    },
    async remove(key) {
      assertKey(key);
      await jitter();
      data.delete(key);
    },
    async listKeys(prefix) {
      assertPrefix(prefix);
      await jitter();
      return [...data.keys()].filter((k) => k.startsWith(prefix));
    },
    async readBinary(key) {
      await jitter();
      const hit = data.get(key);
      return hit ? Buffer.from(hit.value as Buffer) : null;
    },
    async writeBinary(key, value) {
      assertKey(key);
      await jitter();
      data.set(key, { value: Buffer.from(value), etag: ++etag });
    },
  };
}

// ---- selection ------------------------------------------------------------------------

let cached: Promise<GroomingStore> | null = null;

export function groomingStore(): Promise<GroomingStore> {
  cached ??= accountStoreKind() === "blobs" ? blobsStore() : Promise.resolve(fileGroomingStore());
  return cached;
}
