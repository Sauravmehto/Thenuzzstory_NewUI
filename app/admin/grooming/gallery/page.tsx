import AdminHeader from "@/components/admin/AdminHeader";
import GroomingNav from "@/components/admin/grooming/GroomingNav";
import ContentManager from "@/components/admin/grooming/ContentManager";
import { requireAdminPage } from "@/lib/server/admin-auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  await requireAdminPage("/admin/grooming/gallery");
  return (
    <>
      <AdminHeader />
      <main className="admin-main">
        <GroomingNav />
        <ContentManager kind="gallery" />
      </main>
    </>
  );
}
