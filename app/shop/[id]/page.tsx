import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProduct, PRODUCTS } from "@/lib/catalog";
import { formatPrice } from "@/lib/money";
import ProductDetail from "@/components/ProductDetail";

type Params = Promise<{ id: string }>;

export function generateStaticParams() {
  return PRODUCTS.map((product) => ({ id: product.id }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const product = getProduct(id);
  if (!product) return { title: "Product not found | The Nuzz Story" };
  return {
    title: `${product.name} | The Nuzz Story`,
    description: `${product.name}, ${formatPrice(product.priceCents)} in ${product.category} at The Nuzz Story.`,
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { id } = await params;
  const product = getProduct(id);
  if (!product) notFound();
  return <ProductDetail product={product} />;
}
