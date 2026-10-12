import "server-only";
import type { PublicDetailsFile } from "@/lib/catalog-core/schema";
import type { Product } from "@/lib/types";
import detailsFile from "@/data/catalog.details.json";

/**
 * Description, printed label and attributes for published products. Kept out
 * of data/catalog.public.json (which every page's bundle includes, through the
 * cart) and only read here, on the server, for the product page.
 */
const DETAILS = (detailsFile as unknown as PublicDetailsFile).details;

export function withDetails(product: Product): Product {
  const d = DETAILS[product.id];
  if (!d) return product;
  return { ...product, ...d, label: d.label ? { ...product.label, ...d.label } : product.label };
}
