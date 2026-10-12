import { notFound } from "next/navigation";
import ProductDetail from "@/components/ProductDetail";
import { publishProblems, toPreviewProduct } from "@/lib/catalog-core/schema";
import { requireAdminPage } from "@/lib/server/admin-auth";
import { catalogStore } from "@/lib/server/catalog-admin";

export const dynamic = "force-dynamic";

/** The product page exactly as customers would see it, for any status. Buying is disabled. */
export default async function ProductPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdminPage(`/admin/products/${id}/preview`);
  const product = (await catalogStore.read()).products.find((p) => p.id === id);
  if (!product) notFound();
  return (
    <ProductDetail
      product={toPreviewProduct(product)}
      preview={{
        status: product.status === "active" ? "published" : product.status,
        problems: product.status === "draft" ? publishProblems(product) : [],
        editHref: `/admin/products/${product.id}`,
      }}
    />
  );
}
