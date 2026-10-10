import "server-only";
import { getProduct } from "@/lib/catalog";
import type { Product } from "@/lib/types";
import type { DemoState } from "./demo";

/**
 * The server's view of a product. In a real store this would be a database or
 * pricing service; here it's the static catalog plus any demo price or
 * stock move. The client's copy of the catalog is only a snapshot.
 */
export function getServerProduct(id: string, demo: DemoState): Product | undefined {
  const product = getProduct(id);
  if (!product) return undefined;
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
