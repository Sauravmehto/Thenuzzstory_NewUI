"use client";

import Link from "next/link";
import { useMemo, useState, type SyntheticEvent } from "react";
import { CATEGORIES, PLACEHOLDER_IMAGE, publishProblems, type CatalogProduct, type ProductStatus } from "@/lib/catalog-core/schema";
import { formatPrice } from "@/lib/money";
import { SHOP_FILTERS } from "@/lib/shop-filters";
import { toPreviewProduct } from "@/lib/catalog-core/schema";
import { Callout, EmptyState, PageHeader, StatCards, StatusTabs } from "@/components/admin/AdminUI";

/** "₹220 – ₹760" across priced packs, or "no price". */
function packRange(p: CatalogProduct) {
  const prices = p.variants.map((v) => v.priceCents).filter((c): c is number => c !== null);
  if (!prices.length) return <span className="admin-muted">no price</span>;
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  return lo === hi ? formatPrice(lo) : `${formatPrice(lo)} – ${formatPrice(hi)}`;
}

const STATUS_LABEL: Record<ProductStatus, string> = { draft: "Draft", coming_soon: "Coming soon", active: "Published", archived: "Archived" };
/** Live products first, archived last; the catalog order is kept inside each group. */
const STATUS_ORDER: Record<ProductStatus, number> = { active: 0, coming_soon: 1, draft: 2, archived: 3 };

/** A missing photo shows the placeholder instead of a broken-image icon. */
const showPlaceholder = (e: SyntheticEvent<HTMLImageElement>) => {
  const img = e.currentTarget;
  if (!img.src.endsWith(PLACEHOLDER_IMAGE)) img.src = PLACEHOLDER_IMAGE;
};

type StatusFilter = "all" | ProductStatus;

export default function AdminProductList({ products, readOnly = false }: { products: CatalogProduct[]; readOnly?: boolean }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [group, setGroup] = useState("all");

  const counts = useMemo(() => {
    const c = { all: products.length, draft: 0, coming_soon: 0, active: 0, archived: 0 };
    for (const p of products) c[p.status] += 1;
    return c;
  }, [products]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filter = SHOP_FILTERS.find((f) => f.key === group);
    return products
      .filter((p) => {
        if (status !== "all" && p.status !== status) return false;
        if (group.startsWith("category:") && p.category !== group.slice(9)) return false;
        if (filter && group !== "all" && !filter.match(toPreviewProduct(p))) return false;
        if (!q) return true;
        return [p.name, p.id, p.category, p.subcategory, p.brand].filter(Boolean).join(" ").toLowerCase().includes(q);
      })
      .map((p, i) => ({ p, i }))
      .sort((a, b) => STATUS_ORDER[a.p.status] - STATUS_ORDER[b.p.status] || a.i - b.i)
      .map(({ p }) => p);
  }, [products, query, status, group]);

  const anyFilter = query.trim() !== "" || group !== "all" || status !== "all";
  const clearFilters = () => {
    setQuery("");
    setGroup("all");
    setStatus("all");
  };

  return (
    <section aria-labelledby="admin-products-title">
      <PageHeader
        id="admin-products-title"
        title="Products"
        description="Everything you sell in the online shop. Open a product to change its price, stock, photos or status."
        actions={
          <Link href="/admin/products/new" className="admin-btn admin-btn--primary">
            + New product
          </Link>
        }
      />

      {readOnly ? (
        <Callout
          tone="warn"
          detailsLabel="Why?"
          details={
            <p>
              Products are stored in <code>data/catalog.json</code> in the code. The live site runs a read-only copy of the last deploy, so changes
              made here couldn&apos;t be saved. Orders and grooming are stored separately and can be changed here.
            </p>
          }
        >
          <strong>View only on the live site.</strong> To change products, open the admin on your computer (<code>npm run dev</code> →{" "}
          <code>/admin</code>), then commit and push to publish.
        </Callout>
      ) : (
        <Callout
          detailsLabel="Details for developers"
          details={
            <p>
              Saved to <code>data/catalog.json</code> on this computer. Commit and redeploy to update the live site.
            </p>
          }
        >
          Product changes are saved on this computer. They show on the live website after the next publish.
        </Callout>
      )}

      <StatCards<StatusFilter>
        label="Products by status (click to filter)"
        selected={status}
        onSelect={(k) => setStatus((cur) => (cur === k ? "all" : k))}
        stats={[
          { key: "active", label: "Published", value: counts.active, hint: "visible in the shop", tone: "green" },
          { key: "draft", label: "Drafts", value: counts.draft, hint: "not visible yet", tone: "amber" },
          { key: "coming_soon", label: "Coming soon", value: counts.coming_soon, hint: "shown, can't be bought", tone: "violet" },
          { key: "archived", label: "Archived", value: counts.archived, hint: "hidden from the shop", tone: "grey" },
        ]}
      />

      <div className="admin-filterbar">
        <StatusTabs<StatusFilter>
          label="Status"
          value={status}
          onChange={setStatus}
          tabs={[
            { key: "all", label: "All", count: counts.all },
            { key: "active", label: "Published", count: counts.active },
            { key: "draft", label: "Drafts", count: counts.draft },
            { key: "coming_soon", label: "Coming soon", count: counts.coming_soon },
            { key: "archived", label: "Archived", count: counts.archived },
          ]}
        />
        <div className="admin-filters">
          <label className="admin-search">
            <span className="visually-hidden">Search products</span>
            <input type="search" placeholder="Search by name, id, category…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label className="admin-select">
            <span>Category</span>
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <optgroup label="Shop filters">
                {SHOP_FILTERS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.key === "all" ? "All categories" : f.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Categories">
                {CATEGORIES.map((c) => (
                  <option key={c} value={`category:${c}`}>
                    {c}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {anyFilter && (
            <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      <p className="admin-count" role="status">
        Showing {visible.length} of {products.length} products
      </p>

      {visible.length === 0 ? (
        <EmptyState
          icon="🔍"
          title={products.length ? "No products match" : "No products yet"}
          action={
            products.length ? (
              <button type="button" className="admin-btn" onClick={clearFilters}>
                Clear filters
              </button>
            ) : (
              <Link href="/admin/products/new" className="admin-btn admin-btn--primary">
                + New product
              </Link>
            )
          }
        >
          {products.length ? "Try another search, or clear the filters to see every product." : "Add your first product, or import them from photos."}
        </EmptyState>
      ) : (
        <ul className="admin-list">
          {visible.map((p) => {
            const problems = publishProblems(p);
            return (
              <li key={p.id} className="admin-row" data-status={p.status}>
                <img
                  src={p.images[0]?.src ?? PLACEHOLDER_IMAGE}
                  alt=""
                  width={56}
                  height={56}
                  loading="lazy"
                  className="admin-row__thumb"
                  onError={showPlaceholder}
                />
                <div className="admin-row__main">
                  <Link href={`/admin/products/${p.id}`} className="admin-row__name">
                    {p.name}
                  </Link>
                  <p className="admin-row__meta">
                    <span className="admin-row__cat">{p.subcategory ?? p.category}</span>
                    <span aria-hidden="true"> · </span>
                    {p.images.length} photo{p.images.length === 1 ? "" : "s"}
                    <span aria-hidden="true"> · </span>
                    <code>{p.id}</code>
                    {p.featuredToday && (
                      <>
                        {" "}
                        <span className="admin-chip admin-chip--offer">today&apos;s offer</span>
                      </>
                    )}
                  </p>
                </div>
                <div className="admin-row__price">
                  {p.variants?.length ? (
                    <>
                      <strong>{packRange(p)}</strong>
                      <span className="admin-muted">
                        {p.variants.length} pack{p.variants.length === 1 ? "" : "s"} · {p.variants.reduce((n, v) => n + (v.stock ?? 0), 0)} in stock
                      </span>
                    </>
                  ) : (
                    <>
                      <strong>{p.priceCents === null ? <span className="admin-muted">no price</span> : formatPrice(p.priceCents)}</strong>
                      <span className="admin-muted">{p.stock === null ? "no stock set" : `${p.stock} in stock`}</span>
                    </>
                  )}
                </div>
                <div className="admin-row__status">
                  <span className={`admin-chip admin-chip--${p.status}`}>{STATUS_LABEL[p.status]}</span>
                  {(p.status === "draft" || p.status === "coming_soon") && (
                    <span className={problems.length ? "admin-muted" : "admin-ok"}>
                      {problems.length ? `${problems.length} thing${problems.length === 1 ? "" : "s"} to fill in` : "ready to publish"}
                    </span>
                  )}
                  {p.reviewFlags.length > 0 && (
                    <span className="admin-warn">
                      {p.reviewFlags.length} review note{p.reviewFlags.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <div className="admin-row__actions">
                  <Link href={`/admin/products/${p.id}`} className="admin-btn admin-btn--primary admin-btn--sm">
                    Edit<span className="visually-hidden"> {p.name}</span>
                  </Link>
                  <Link href={`/admin/products/${p.id}/preview`} className="admin-btn admin-btn--ghost admin-btn--sm">
                    Preview<span className="visually-hidden"> {p.name}</span>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
