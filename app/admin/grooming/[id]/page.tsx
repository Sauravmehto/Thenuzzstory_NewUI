import AdminHeader from "@/components/admin/AdminHeader";
import AppointmentDetail from "@/components/admin/grooming/AppointmentDetail";
import GroomingNav from "@/components/admin/grooming/GroomingNav";
import { requireAdminPage } from "@/lib/server/admin-auth";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdminPage(`/admin/grooming/${encodeURIComponent(id)}`);
  return (
    <>
      <AdminHeader />
      <main className="admin-main">
        <GroomingNav />
        <AppointmentDetail id={id} />
      </main>
    </>
  );
}
