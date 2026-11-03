import { notFound } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import AdminProductEditor from "@/components/admin/AdminProductEditor";
import { requireAdminPage } from "@/lib/server/admin-auth";
import { catalogStore } from "@/lib/server/catalog-admin";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdminPage(`/admin/products/${id}`);
  const product = (await catalogStore.read()).products.find((p) => p.id === id);
  if (!product) notFound();
  return (
    <>
      <AdminHeader />
      <main className="admin-main">
        {/* key: a different product (or a reload after saving elsewhere) starts a fresh form */}
        <AdminProductEditor key={`${product.id}:${product.updatedAt}`} mode="edit" product={product} />
      </main>
    </>
  );
}
