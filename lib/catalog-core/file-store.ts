/**
 * File-based catalog + image storage (admin storage "option A").
 *
 * Everything else talks to the CatalogStore / AssetStore interfaces, so moving
 * to hosted storage (e.g. Netlify Blobs) means writing another implementation
 * of these two interfaces, not touching the admin or shop code.
 *
 * Plain Node (no aliases, explicit .ts imports) so the CLI can use it too.
 */
import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertCatalogFile, isValidId, isValidImageSrc, toPublicCatalog, toPublicDetails, type CatalogFile } from "./schema.ts";

export interface CatalogStore {
  read(): Promise<CatalogFile>;
  /**
   * Applies `mutate` to the latest catalog and saves it atomically.
   * Pass the revision the caller edited against; a different current revision
   * throws RevisionConflictError (someone else saved first). Pass null to skip.
   */
  update(expectedRevision: number | null, mutate: (draft: CatalogFile) => CatalogFile | void): Promise<CatalogFile>;
}

export interface AssetStore {
  /** True if a public image path (e.g. /assets/products/x/front.jpg) exists. */
  exists(src: string): Promise<boolean>;
  /** Image files already stored for a product (public paths). */
  listProductImages(productId: string): Promise<string[]>;
  /** Saves a processed image and returns its public path. Never overwrites. */
  saveProductImage(productId: string, baseName: string, data: Buffer, ext: "jpg"): Promise<string>;
}

export class RevisionConflictError extends Error {
  readonly currentRevision: number;
  constructor(currentRevision: number) {
    super("The catalog was changed by someone else. Reload to see the latest version.");
    this.currentRevision = currentRevision;
  }
}

export interface FileStoreOptions {
  /** Project root (the folder with package.json). */
  root: string;
}

const LOCK_STALE_MS = 15_000;

/** Windows refuses to replace a file another process has open for a moment (file watchers, antivirus). */
const BUSY = new Set(["EPERM", "EACCES", "EBUSY"]);

async function writeAtomic(file: string, contents: string) {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, contents, "utf8");
  try {
    // Retry briefly while the target is busy (like graceful-fs); the old file stays intact meanwhile.
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmp, file);
        return;
      } catch (err) {
        if (!BUSY.has((err as NodeJS.ErrnoException).code ?? "") || attempt >= 20) throw err;
        await new Promise((r) => setTimeout(r, 25 + attempt * 25));
      }
    }
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

/** Cross-process lock (the CLI and the dev server may both write). */
async function withLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(`${process.pid} ${new Date().toISOString()}`);
      await handle.close();
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      const info = await stat(lockPath).catch(() => null);
      if (info && Date.now() - info.mtimeMs > LOCK_STALE_MS) {
        await rm(lockPath, { force: true }); // left behind by a crashed process
        continue;
      }
      if (Date.now() > deadline) throw new Error("The catalog is busy (another save is in progress). Try again.");
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  try {
    return await fn();
  } finally {
    await rm(lockPath, { force: true });
  }
}

export function createFileCatalogStore({ root }: FileStoreOptions): CatalogStore {
  const catalogPath = path.join(root, "data", "catalog.json");
  const publicPath = path.join(root, "data", "catalog.public.json");
  const detailsPath = path.join(root, "data", "catalog.details.json");
  const lockPath = path.join(root, "data", ".catalog.lock");
  let queue: Promise<unknown> = Promise.resolve();

  async function read(): Promise<CatalogFile> {
    return assertCatalogFile(JSON.parse(await readFile(catalogPath, "utf8")));
  }

  function update(expectedRevision: number | null, mutate: (draft: CatalogFile) => CatalogFile | void) {
    const run = async () =>
      withLock(lockPath, async () => {
        const current = await read();
        if (expectedRevision !== null && current.revision !== expectedRevision)
          throw new RevisionConflictError(current.revision);
        const draft = structuredClone(current);
        const next = assertCatalogFile(mutate(draft) ?? draft);
        next.revision = current.revision + 1;
        next.updatedAt = new Date().toISOString();
        // Full catalog first: if the second write failed, `sync-public` rebuilds the public file.
        await writeAtomic(catalogPath, JSON.stringify(next, null, 2) + "\n");
        await writeAtomic(publicPath, JSON.stringify(toPublicCatalog(next), null, 2) + "\n");
        await writeAtomic(detailsPath, JSON.stringify(toPublicDetails(next), null, 2) + "\n");
        return next;
      });
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  }

  return { read, update };
}

export function createFileAssetStore({ root }: FileStoreOptions): AssetStore {
  const publicDir = path.join(root, "public");
  const productsDir = path.join(publicDir, "assets", "products");

  const resolvePublic = (src: string) => {
    if (!isValidImageSrc(src)) return null;
    const full = path.join(publicDir, ...src.split("/").filter(Boolean));
    return full.startsWith(publicDir + path.sep) ? full : null;
  };

  return {
    async exists(src) {
      const full = resolvePublic(src);
      if (!full) return false;
      return access(full, constants.R_OK).then(() => true, () => false);
    },

    async listProductImages(productId) {
      if (!isValidId(productId)) return [];
      const dir = path.join(productsDir, productId);
      const files = await readdir(dir).catch(() => [] as string[]);
      return files
        .filter((f) => /\.(?:jpe?g|png|webp|avif)$/i.test(f))
        .sort()
        .map((f) => `/assets/products/${productId}/${f}`)
        .filter(isValidImageSrc);
    },

    async saveProductImage(productId, baseName, data, ext) {
      if (!isValidId(productId)) throw new Error("Invalid product id.");
      const safeBase = baseName.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "image";
      const dir = path.join(productsDir, productId);
      await mkdir(dir, { recursive: true });
      for (let n = 1; n < 1000; n++) {
        const name = n === 1 ? `${safeBase}.${ext}` : `${safeBase}-${n}.${ext}`;
        try {
          // "wx": fail instead of overwriting an existing file.
          await writeFile(path.join(dir, name), data, { flag: "wx" });
          return `/assets/products/${productId}/${name}`;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        }
      }
      throw new Error("Too many images with that name.");
    },
  };
}
