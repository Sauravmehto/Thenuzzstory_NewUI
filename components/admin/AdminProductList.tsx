"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORIES, PLACEHOLDER_IMAGE, publishProblems, type CatalogProduct, type ProductStatus } from "@/lib/catalog-core/schema";
import { formatPrice } from "@/lib/money";
import { SHOP_FILTERS } from "@/lib/shop-filters";
import { toPreviewProduct } from "@/lib/catalog-core/schema";

/** "₹220 – ₹760" across priced packs, or "no price". */
function packRange(p: CatalogProduct) {
  const prices = p.variants.map((v) => v.priceCents).filter((c): c is number => c !== null);
  if (!prices.length) return <span className="admin-muted">no price</span>;
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  return lo === hi ? formatPrice(lo) : `${formatPrice(lo)} – ${formatPrice(hi)}`;
}

const STATUS_LABEL: Record<ProductStatus, string> = { draft: "Draft", coming_soon: "Coming soon", active: "Published", archived: "Archived" };

export default function AdminProductList({ products }: { products: CatalogProduct[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | ProductStatus>("all");
  const [group, setGroup] = useState("all");

  const counts = useMemo(() => {
    const c = { all: products.length, draft: 0, coming_soon: 0, active: 0, archived: 0 };
    for (const p of products) c[p.status] += 1;
    return c;
  }, [products]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filter = SHOP_FILTERS.find((f) => f.key === group);
    return products.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (group.startsWith("category:") && p.category !== group.slice(9)) return false;
      if (filter && group !== "all" && !filter.match(toPreviewProduct(p))) return false;
      if (!q) return true;
      return [p.name, p.id, p.category, p.subcategory, p.brand].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [products, query, status, group]);

  return (
    <section aria-labelledby="admin-products-title">
      <div className="admin-toolbar">
        <h1 id="admin-products-title">Products</h1>
        <Link href="/admin/products/new" className="admin-btn admin-btn--primary">
          + New product
        </Link>
      </div>

      <div className="admin-filters">
        <label>
          <span className="visually-hidden">Search products</span>
          <input type="search" placeholder="Search by name, id, category…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          Status{" "}
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">All ({counts.all})</option>
            <option value="draft">Draft ({counts.draft})</option>
            <option value="coming_soon">Coming soon ({counts.coming_soon})</option>
            <option value="active">Published ({counts.active})</option>
            <option value="archived">Archived ({counts.archived})</option>
          </select>
        </label>
        <label>
          Filter{" "}
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <optgroup label="Shop filters">
              {SHOP_FILTERS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
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
      </div>

      <p className="admin-count" role="status">
        {visible.length} of {products.length} products
      </p>

      {visible.length === 0 ? (
        <p className="admin-empty">No products match. Clear the search or filters.</p>
      ) : (
        <ul className="admin-list">
          {visible.map((p) => {
            const problems = publishProblems(p);
            return (
              <li key={p.id} className="admin-row">
                <img src={p.images[0]?.src ?? PLACEHOLDER_IMAGE} alt="" width={56} height={56} loading="lazy" className="admin-row__thumb" />
                <div className="admin-row__main">
                  <Link href={`/admin/products/${p.id}`} className="admin-row__name">
                    {p.name}
                  </Link>
                  <p className="admin-row__meta">
                    <code>{p.id}</code> · {p.subcategory ?? p.category} · {p.images.length} image{p.images.length === 1 ? "" : "s"}
                    {p.featuredToday && <> · <span className="admin-chip admin-chip--offer">today&apos;s offer</span></>}
                  </p>
                </div>
                <div className="admin-row__price">
                  {p.variants?.length ? (
                    <>
                      {packRange(p)}
                      <span className="admin-muted">
                        {p.variants.length} pack{p.variants.length === 1 ? "" : "s"} · {p.variants.reduce((n, v) => n + (v.stock ?? 0), 0)} in stock
                      </span>
                    </>
                  ) : (
                    <>
                      {p.priceCents === null ? <span className="admin-muted">no price</span> : formatPrice(p.priceCents)}
                      <span className="admin-muted">{p.stock === null ? "no stock set" : `${p.stock} in stock`}</span>
                    </>
                  )}
                </div>
                <div className="admin-row__status">
                  <span className={`admin-chip admin-chip--${p.status}`}>{STATUS_LABEL[p.status]}</span>
                  {(p.status === "draft" || p.status === "coming_soon") && (
                    <span className={problems.length ? "admin-muted" : "admin-ok"}>
                      {problems.length ? `${problems.length} to do` : "ready to publish"}
                    </span>
                  )}
                  {p.reviewFlags.length > 0 && <span className="admin-warn">{p.reviewFlags.length} review note{p.reviewFlags.length === 1 ? "" : "s"}</span>}
                </div>
                <div className="admin-row__actions">
                  <Link href={`/admin/products/${p.id}`} className="admin-btn">
                    Edit
                  </Link>
                  <Link href={`/admin/products/${p.id}/preview`} className="admin-btn admin-btn--ghost">
                    Preview
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
