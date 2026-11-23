import AdminHeader from "@/components/admin/AdminHeader";
import GroomingNav from "@/components/admin/grooming/GroomingNav";
import AppointmentsList from "@/components/admin/grooming/AppointmentsList";
import { requireAdminPage } from "@/lib/server/admin-auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdminPage("/admin/grooming");
  return (
    <>
      <AdminHeader />
      <main className="admin-main">
        <GroomingNav />
        <AppointmentsList />
      </main>
    </>
  );
}
