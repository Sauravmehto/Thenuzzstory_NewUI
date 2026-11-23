import "server-only";
import { NextResponse } from "next/server";
import { createFileAssetStore, createFileCatalogStore, type AssetStore, type CatalogStore } from "@/lib/catalog-core/file-store";
import { accountStoreKind } from "@/lib/server/account-store";

/**
 * The admin's storage. Swap these two lines for another implementation of
 * CatalogStore / AssetStore (e.g. Netlify Blobs) to move off local files.
 */
const root = process.cwd();
export const catalogStore: CatalogStore = createFileCatalogStore({ root });
export const assetStore: AssetStore = createFileAssetStore({ root });

/**
 * The catalog lives in files in the repo (data/catalog.json, public/assets/products).
 * On Netlify those files are a read-only copy of the last deploy, so the live admin
 * can show products but not change them: edit locally, then commit and push.
 */
export function catalogReadOnly(): boolean {
  return accountStoreKind() === "blobs";
}

export const CATALOG_READ_ONLY_MESSAGE =
  "Products can't be changed on the live site. Edit them in the admin on your computer (npm run dev → /admin), then commit and push to publish.";

/** Call first in every catalog write route: a clear 409 instead of a crash on a read-only disk. */
export function catalogWriteBlocked(): NextResponse | null {
  if (!catalogReadOnly()) return null;
  return NextResponse.json({ ok: false, code: "read_only", message: CATALOG_READ_ONLY_MESSAGE }, { status: 409 });
}
