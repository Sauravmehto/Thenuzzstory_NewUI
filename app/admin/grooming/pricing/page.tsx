import AdminHeader from "@/components/admin/AdminHeader";
import GroomingNav from "@/components/admin/grooming/GroomingNav";
import PricingEditor from "@/components/admin/grooming/PricingEditor";
import { requireAdminPage } from "@/lib/server/admin-auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdminPage("/admin/grooming/pricing");
  return (
    <>
      <AdminHeader />
      <main className="admin-main">
        <GroomingNav />
        <PricingEditor />
      </main>
    </>
  );
}
