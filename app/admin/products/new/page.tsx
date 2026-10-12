import AdminHeader from "@/components/admin/AdminHeader";
import AdminProductEditor from "@/components/admin/AdminProductEditor";
import { requireAdminPage } from "@/lib/server/admin-auth";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requireAdminPage("/admin/products/new");
  return (
    <>
      <AdminHeader />
      <main className="admin-main">
        <AdminProductEditor mode="create" />
      </main>
    </>
  );
}
