import AdminHeader from "@/components/admin/AdminHeader";
import AdminOrders from "@/components/admin/AdminOrders";
import { requireAdminPage } from "@/lib/server/admin-auth";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  await requireAdminPage("/admin/orders");
  return (
    <>
      <AdminHeader />
      <main className="admin-main">
        <AdminOrders />
      </main>
    </>
  );
}
