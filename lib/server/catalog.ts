import "server-only";
import { getProduct } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import type { DemoState } from "./demo";

/**
 * The server's view of a product. In a real store this would be a database or
 * pricing service; here it's the published catalog plus any demo price or
 * stock move. The client's copy of the catalog is only a snapshot.
 *
 * Only published products exist here: drafts and archived products are not in
 * data/catalog.public.json, so the cart, quote and checkout APIs treat them as
 * unknown and they can't be bought. "Coming soon" products are in the public
 * file (so the shop can show them) but are refused here, and have no price.
 */
export function getServerProduct(id: string, demo: DemoState): Product | undefined {
  const product = getProduct(id);
  if (!product || product.comingSoon || !Number.isInteger(product.priceCents) || product.priceCents <= 0) return undefined;
  // With pack sizes, only a pack ("<id>--70g") can be bought, never the product as a whole.
  if (product.variants?.length) return undefined;
  let live = product;
  if (demo.priceBump?.id === id) {
    const bumped = Math.round(product.priceCents * (1 + demo.priceBump.percent / 100));
    live = { ...live, priceCents: Math.max(1, bumped) };
  }
  if (demo.stockDrop?.id === id) {
    live = { ...live, stock: Math.min(live.stock, demo.stockDrop.stock) };
  }
  return live;
}
