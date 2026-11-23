import AdminHeader from "@/components/admin/AdminHeader";
import AdminProductList from "@/components/admin/AdminProductList";
import { Callout, EmptyState, PageHeader } from "@/components/admin/AdminUI";
import { requireAdminPage } from "@/lib/server/admin-auth";
import { catalogReadOnly, catalogStore } from "@/lib/server/catalog-admin";
import type { CatalogFile } from "@/lib/catalog-core/schema";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  await requireAdminPage("/admin");
  let catalog: CatalogFile | null = null;
  try {
    catalog = await catalogStore.read();
  } catch (err) {
    // Show a clear message instead of a blank 500 page; the server log keeps the detail.
    console.error("[admin] couldn't read the catalog", err);
  }
  return (
    <>
      <AdminHeader />
      <main className="admin-main">
        {catalog ? (
          <AdminProductList products={catalog.products} readOnly={catalogReadOnly()} />
        ) : (
          <section aria-labelledby="admin-products-title">
            <PageHeader id="admin-products-title" title="Products" />
            <Callout tone="warn">The product list couldn&apos;t be loaded on this server.</Callout>
            <EmptyState icon="⚠️" role="alert" title="Couldn't load products">
              Orders and grooming still work. Check the deploy log, or edit products in the admin on your computer.
            </EmptyState>
          </section>
        )}
      </main>
    </>
  );
}
