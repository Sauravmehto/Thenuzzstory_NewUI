import AdminHeader from "@/components/admin/AdminHeader";
import GroomingNav from "@/components/admin/grooming/GroomingNav";
import AvailabilityEditor from "@/components/admin/grooming/AvailabilityEditor";
import { requireAdminPage } from "@/lib/server/admin-auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdminPage("/admin/grooming/availability");
  return (
    <>
      <AdminHeader />
      <main className="admin-main">
        <GroomingNav />
        <AvailabilityEditor />
      </main>
    </>
  );
}
