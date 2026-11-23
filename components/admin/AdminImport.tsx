"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "@/lib/admin-client";
import { Callout, EmptyState, PageHeader, StatCards } from "@/components/admin/AdminUI";
import type { ImportReport, PlanItem } from "@/lib/catalog-core/importer";

type Summary = Omit<PlanItem, "product">;
interface PlanResponse {
  manifestVersion: number;
  counts: Record<PlanItem["status"], number>;
  items: Summary[];
}

const STATUS_TEXT: Record<PlanItem["status"], string> = { new: "New", exists: "Already added", invalid: "Can't import" };

/**
 * Bulk import from data/import/product-list.manifest.json:
 * preview -> choose -> import as drafts -> report. Safe to repeat.
 */
export default function AdminImport() {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const result = await adminRequest<PlanResponse>("/api/admin/import");
    if (!result.ok) return setError(result.message);
    setPlan(result);
    setSelected(new Set(result.items.filter((i) => i.status === "new").map((i) => i.id)));
  }, []);
  useEffect(() => void load(), [load]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const runImport = async () => {
    setBusy(true);
    const result = await adminRequest<{ report: ImportReport }>("/api/admin/import", { method: "POST", json: { ids: [...selected] } });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    setReport(result.report);
    await load();
  };

  const newItems = plan?.items.filter((i) => i.status === "new") ?? [];

  return (
    <section aria-labelledby="import-title">
      <PageHeader
        id="import-title"
        title="Import products from photos"
        description="Add many products at once from the product photo list. Nothing goes live until you add a price and publish it."
      />

      <ol className="admin-steps">
        <li>
          <span className="admin-steps__n">1</span>
          <span>
            <strong>Photos are listed</strong>
            <span className="admin-muted">New product photos are added to the product list.</span>
          </span>
        </li>
        <li>
          <span className="admin-steps__n">2</span>
          <span>
            <strong>Pick what to add</strong>
            <span className="admin-muted">Tick the new products below.</span>
          </span>
        </li>
        <li>
          <span className="admin-steps__n">3</span>
          <span>
            <strong>Import as drafts</strong>
            <span className="admin-muted">They arrive without a price and stay hidden from the shop.</span>
          </span>
        </li>
      </ol>

      <Callout
        detailsLabel="Details for developers"
        details={
          <p>
            Reads <code>data/import/product-list.manifest.json</code> (the reviewed list made from <code>source-assets/product_list</code>). Products
            already in the catalog are skipped, never overwritten, so this is safe to run again. Run <code>npm run catalog:images</code> first if you
            added photos.
          </p>
        }
      >
        Safe to repeat: products already in your catalog are never changed.
      </Callout>

      {error && (
        <p className="admin-message admin-message--error" role="alert">
          {error}
        </p>
      )}

      {report && (
        <div className="admin-message admin-message--ok" role="status">
          <p>
            Imported {report.imported.length} draft{report.imported.length === 1 ? "" : "s"} · skipped {report.skippedExisting.length} already in the
            catalog · {report.skippedNotApproved.length} not selected · {report.failed.length} failed.
          </p>
          {report.imported.length > 0 && (
            <p>
              <Link href="/admin">See them in the product list</Link>
            </p>
          )}
          {report.failed.length > 0 && (
            <ul>
              {report.failed.map((f) => (
                <li key={f.id}>
                  {f.id}: {f.problems.join("; ")}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!plan ? (
        !error && <EmptyState icon="⏳" title="Reading the product list…" />
      ) : (
        <>
          <StatCards
            label="Product list summary"
            stats={[
              { key: "new", label: "New", value: plan.counts.new, hint: "ready to import", tone: "blue" },
              { key: "exists", label: "Already added", value: plan.counts.exists, hint: "in your catalog", tone: "green" },
              { key: "invalid", label: "Can't import", value: plan.counts.invalid, hint: plan.counts.invalid ? "see notes below" : "none", tone: plan.counts.invalid ? "red" : "grey" },
            ]}
          />
          <p className="admin-count">Product list version {plan.manifestVersion}</p>
          {newItems.length === 0 ? (
            <Callout tone="ok">Everything in the product list is already in your catalog. Nothing new to import.</Callout>
          ) : (
            <div className="admin-actions admin-import-bar">
              <button type="button" className="admin-btn admin-btn--primary" disabled={busy || selected.size === 0} onClick={runImport}>
                {busy ? "Importing…" : selected.size === 0 ? "Tick products to import" : `Import ${selected.size} as draft${selected.size === 1 ? "" : "s"}`}
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => setSelected(selected.size === newItems.length ? new Set() : new Set(newItems.map((i) => i.id)))}
              >
                {selected.size === newItems.length ? "Select none" : "Select all new"}
              </button>
            </div>
          )}
          <ul className="admin-list">
            {plan.items.map((item) => (
              <li key={item.id} className={`admin-row admin-row--${item.status}`}>
                {item.status === "new" ? (
                  <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} aria-label={`Import ${item.name}`} />
                ) : (
                  <span className="admin-row__spacer" aria-hidden="true" />
                )}
                <img src={item.images[0]?.src} alt="" width={56} height={56} loading="lazy" className="admin-row__thumb" />
                <div className="admin-row__main">
                  <p className="admin-row__name">{item.name}</p>
                  <p className="admin-row__meta">
                    <code>{item.id}</code> · {item.subcategory ?? item.category} · {item.images.length} image{item.images.length === 1 ? "" : "s"}
                    {item.labelFacts.mrp && <> · label MRP {item.labelFacts.mrp}</>}
                    {item.labelFacts.netWeight && <> · {item.labelFacts.netWeight}</>}
                  </p>
                  {item.reviewFlags.length > 0 && (
                    <details>
                      <summary className="admin-warn">{item.reviewFlags.length} review note{item.reviewFlags.length === 1 ? "" : "s"}</summary>
                      <ul>
                        {item.reviewFlags.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {item.problems.length > 0 && item.status !== "exists" && (
                    <ul className="admin-error">
                      {item.problems.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <span className={`admin-chip admin-chip--plan-${item.status}`}>{STATUS_TEXT[item.status]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
