import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProduct, PRODUCTS } from "@/lib/catalog";
import { formatPrice } from "@/lib/money";
import ProductDetail from "@/components/ProductDetail";
import { withDetails } from "@/lib/server/catalog-details";

type Params = Promise<{ id: string }>;

export function generateStaticParams() {
  return PRODUCTS.map((product) => ({ id: product.id }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const product = getProduct(id);
  if (!product) return { title: "Product not found | The Nuzz Story" };
  const price = product.comingSoon
    ? "price coming soon"
    : `${product.variants && product.variants.length > 1 ? "from " : ""}${formatPrice(product.priceCents)}`;
  return {
    title: `${product.name} | The Nuzz Story`,
    description: `${product.name}, ${price} in ${product.subcategory ?? product.category} at The Nuzz Story.`,
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { id } = await params;
  const product = getProduct(id);
  if (!product) notFound();
  // The card data plus its description and printed label (server-side only).
  return <ProductDetail product={withDetails(product)} />;
}
