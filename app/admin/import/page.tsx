import AdminHeader from "@/components/admin/AdminHeader";
import AdminImport from "@/components/admin/AdminImport";
import { requireAdminPage } from "@/lib/server/admin-auth";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireAdminPage("/admin/import");
  return (
    <>
      <AdminHeader />
      <main className="admin-main">
        <AdminImport />
      </main>
    </>
  );
}
