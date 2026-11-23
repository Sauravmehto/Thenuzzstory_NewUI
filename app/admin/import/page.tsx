import AdminHeader from "@/components/admin/AdminHeader";
import AdminImport from "@/components/admin/AdminImport";
import { requireAdminPage } from "@/lib/server/admin-auth";
import { Callout } from "@/components/admin/AdminUI";
import { CATALOG_READ_ONLY_MESSAGE, catalogReadOnly } from "@/lib/server/catalog-admin";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireAdminPage("/admin/import");
  return (
    <>
      <AdminHeader />
      <main className="admin-main">
        {catalogReadOnly() && <Callout tone="warn">{CATALOG_READ_ONLY_MESSAGE}</Callout>}
        <AdminImport />
      </main>
    </>
  );
}
