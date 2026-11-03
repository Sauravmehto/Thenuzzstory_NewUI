"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "@/lib/admin-client";
import type { ImportReport, PlanItem } from "@/lib/catalog-core/importer";

type Summary = Omit<PlanItem, "product">;
interface PlanResponse {
  manifestVersion: number;
  counts: Record<PlanItem["status"], number>;
  items: Summary[];
}

const STATUS_TEXT: Record<PlanItem["status"], string> = { new: "New", exists: "Already in catalog", invalid: "Can't import" };

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
      <div className="admin-toolbar">
        <h1 id="import-title">Import from product photos</h1>
      </div>
      <p className="admin-hint">
        Reads <code>data/import/product-list.manifest.json</code> (the reviewed list of products made from{" "}
        <code>source-assets/product_list</code>). Everything is imported as an <strong>unpublished draft</strong> without a price. Products already in
        the catalog are skipped, never overwritten, so this is safe to run again. Run <code>npm run catalog:images</code> first if you added photos.
      </p>

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
        !error && <p className="admin-muted">Reading the manifest…</p>
      ) : (
        <>
          <p className="admin-count">
            Manifest v{plan.manifestVersion}: {plan.counts.new} new · {plan.counts.exists} already in catalog · {plan.counts.invalid} can&apos;t import
          </p>
          <div className="admin-actions">
            <button type="button" className="admin-btn admin-btn--primary" disabled={busy || selected.size === 0} onClick={runImport}>
              {busy ? "Importing…" : `Import ${selected.size} selected as drafts`}
            </button>
            {newItems.length > 0 && (
              <button
                type="button"
                className="admin-btn admin-btn--ghost"
                onClick={() => setSelected(selected.size === newItems.length ? new Set() : new Set(newItems.map((i) => i.id)))}
              >
                {selected.size === newItems.length ? "Select none" : "Select all new"}
              </button>
            )}
          </div>
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
