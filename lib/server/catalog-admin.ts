import "server-only";
import { createFileAssetStore, createFileCatalogStore, type AssetStore, type CatalogStore } from "@/lib/catalog-core/file-store";

/**
 * The admin's storage. Swap these two lines for another implementation of
 * CatalogStore / AssetStore (e.g. Netlify Blobs) to move off local files.
 */
const root = process.cwd();
export const catalogStore: CatalogStore = createFileCatalogStore({ root });
export const assetStore: AssetStore = createFileAssetStore({ root });
