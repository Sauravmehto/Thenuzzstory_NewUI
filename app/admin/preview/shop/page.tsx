import { Suspense } from "react";
import ShopPage from "@/components/ShopPage";
import { toPreviewProduct } from "@/lib/catalog-core/schema";
import { requireAdminPage } from "@/lib/server/admin-auth";
import { catalogStore } from "@/lib/server/catalog-admin";

export const dynamic = "force-dynamic";

/** The shop with drafts included (archived products left out), so new products can be checked before publishing. */
export default async function ShopPreviewPage() {
  await requireAdminPage("/admin/preview/shop");
  const catalog = await catalogStore.read();
  const shown = catalog.products.filter((p) => p.status !== "archived");
  return (
    <Suspense fallback={<div className="shop-page cozy-page" />}>
      <ShopPage
        products={shown.map(toPreviewProduct)}
        preview={{ draftIds: shown.filter((p) => p.status === "draft").map((p) => p.id), hrefBase: "/admin/products" }}
      />
    </Suspense>
  );
}
