import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminHeader from "@/components/admin/AdminHeader";
import { requireAdminPage } from "@/lib/server/admin-auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireAdminPage("/admin/dashboard");
  return (
    <>
      <AdminHeader />
      <main className="admin-main">
        <AdminDashboard />
      </main>
    </>
  );
}
