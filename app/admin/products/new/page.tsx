import AdminHeader from "@/components/admin/AdminHeader";
import AdminProductEditor from "@/components/admin/AdminProductEditor";
import { requireAdminPage } from "@/lib/server/admin-auth";
import { Callout } from "@/components/admin/AdminUI";
import { CATALOG_READ_ONLY_MESSAGE, catalogReadOnly } from "@/lib/server/catalog-admin";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requireAdminPage("/admin/products/new");
  return (
    <>
      <AdminHeader />
      <main className="admin-main">
        {catalogReadOnly() && <Callout tone="warn">{CATALOG_READ_ONLY_MESSAGE}</Callout>}
        <AdminProductEditor mode="create" />
      </main>
    </>
  );
}
