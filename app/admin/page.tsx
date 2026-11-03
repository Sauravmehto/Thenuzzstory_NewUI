import AdminHeader from "@/components/admin/AdminHeader";
import AdminProductList from "@/components/admin/AdminProductList";
import { requireAdminPage } from "@/lib/server/admin-auth";
import { catalogStore } from "@/lib/server/catalog-admin";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  await requireAdminPage("/admin");
  const catalog = await catalogStore.read();
  return (
    <>
      <AdminHeader />
      <main className="admin-main">
        <AdminProductList products={catalog.products} />
      </main>
    </>
  );
}
