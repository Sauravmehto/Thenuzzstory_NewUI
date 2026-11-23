"use client";

import { useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/admin-client";
import { formatRupees } from "@/lib/grooming/money";
import { pricingProblems, samePrice } from "@/lib/grooming/pricing";
import { SIZE_BANDS, type GroomingService, type PricingConfig, type ServicePrice, type SizeBand } from "@/lib/grooming/types";

const rupees = (cents: number | undefined) => (cents === undefined ? "" : String(cents / 100));
const toCents = (v: string) => (v.trim() === "" ? undefined : Math.round(Number(v) * 100));

function priceText(p: ServicePrice, bands: PricingConfig["sizeBands"]) {
  if (p.type === "flat") return formatRupees(p.cents);
  return SIZE_BANDS.map((b) => `${bands.find((x) => x.id === b)?.label.split(" ")[0] ?? b} ${p.bands[b] !== undefined ? formatRupees(p.bands[b]!) : "—"}`).join(" · ");
}

export default function PricingEditor() {
  const [cfg, setCfg] = useState<PricingConfig | null>(null);
  const [menu, setMenu] = useState<PricingConfig | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; problems?: string[] } | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await adminRequest<{ pricing: PricingConfig; menu: PricingConfig }>("/api/admin/grooming/pricing");
      if (!res.ok) return setError(res.message);
      setCfg(res.pricing);
      setMenu(res.menu);
    })();
  }, []);

  const problems = useMemo(() => (cfg ? pricingProblems(cfg) : []), [cfg]);
  if (error) return <p className="admin-empty" role="alert">{error}</p>;
  if (!cfg || !menu) return <p className="admin-empty">Loading…</p>;

  const update = (next: PricingConfig) => {
    setCfg(next);
    setDirty(true);
  };
  const setService = (id: string, patch: Partial<GroomingService>) => update({ ...cfg, services: cfg.services.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const menuService = (id: string) => menu.services.find((s) => s.id === id);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const res = await adminRequest<{ pricing: PricingConfig }>("/api/admin/grooming/pricing", { method: "PUT", json: { pricing: cfg } });
    setSaving(false);
    if (!res.ok) return setMessage({ tone: "error", text: res.message, problems: res.problems });
    setCfg(res.pricing);
    setDirty(false);
    setMessage({ tone: "ok", text: `Saved (version ${res.pricing.version}). The grooming page and new bookings use these prices now.` });
  };

  const addService = (sectionId: string) => {
    const base = `service-${Date.now().toString(36)}`;
    update({
      ...cfg,
      services: [
        ...cfg.services,
        {
          id: base,
          sectionId,
          name: "New service",
          description: "",
          species: ["dog", "cat"],
          role: "main_or_extra",
          price: { type: "flat", cents: 10000 },
          menuPrice: { type: "flat", cents: 10000 },
          slotsNeeded: null,
          active: false,
          order: Math.max(0, ...cfg.services.map((s) => s.order)) + 1,
        },
      ],
    });
  };

  return (
    <section aria-labelledby="gr-pr-title">
      <div className="admin-toolbar">
        <h1 id="gr-pr-title">Grooming pricing</h1>
        <div className="admin-toolbar__actions">
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={() => {
              if (window.confirm("Reset every price, name and description to the printed menu? Durations you set are kept.")) {
                update({ ...structuredClone(menu), version: cfg.version, services: menu.services.map((m) => ({ ...structuredClone(m), slotsNeeded: cfg.services.find((s) => s.id === m.id)?.slotsNeeded ?? null })) });
              }
            }}
          >
            Reset to printed menu
          </button>
          <button type="button" className="admin-btn admin-btn--primary" onClick={() => void save()} disabled={saving || !dirty || problems.length > 0}>
            {saving ? "Saving…" : dirty ? "Save prices" : "Saved"}
          </button>
        </div>
      </div>
      <p className="admin-muted">
        Prices start as the printed grooming menu. A price you change shows a <span className="admin-chip admin-chip--draft">differs from menu</span> badge. Version{" "}
        {cfg.version}.
      </p>
      {message && (
        <div className={`admin-message admin-message--${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
          <p>{message.text}</p>
          {message.problems && (
            <ul>
              {message.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {problems.length > 0 && (
        <div className="admin-warn">
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="admin-card">
        <h2 className="admin-subtitle">Size bands (dogs)</h2>
        <p className="admin-hint">A weight on the line belongs to the smaller band (10 kg = Small).</p>
        <div className="admin-field-row">
          {cfg.sizeBands.map((b) => (
            <div key={b.id} className="admin-gr-band">
              <label className="admin-field">
                <span>Label</span>
                <input value={b.label} onChange={(e) => update({ ...cfg, sizeBands: cfg.sizeBands.map((x) => (x.id === b.id ? { ...x, label: e.target.value } : x)) })} />
              </label>
              <label className="admin-field">
                <span>Up to (kg)</span>
                <input
                  type="number"
                  min={1}
                  value={b.maxKg ?? ""}
                  placeholder="no limit"
                  disabled={b.maxKg === null}
                  onChange={(e) => update({ ...cfg, sizeBands: cfg.sizeBands.map((x) => (x.id === b.id ? { ...x, maxKg: Number(e.target.value) } : x)) })}
                />
              </label>
            </div>
          ))}
        </div>
      </div>

      {[...cfg.sections]
        .sort((a, b) => a.order - b.order)
        .map((sec) => (
          <div key={sec.id} className="admin-card">
            <h2 className="admin-subtitle">{sec.title}</h2>
            {sec.inclusions.length > 0 && (
              <label className="admin-field">
                <span>Included in every package (one per line)</span>
                <textarea
                  rows={Math.min(10, sec.inclusions.length + 1)}
                  value={sec.inclusions.join("\n")}
                  onChange={(e) =>
                    update({ ...cfg, sections: cfg.sections.map((s) => (s.id === sec.id ? { ...s, inclusions: e.target.value.split("\n").map((l) => l.trimStart()).filter((l, i, a) => l || i < a.length - 1) } : s)) })
                  }
                />
              </label>
            )}
            <ul className="admin-gr-services">
              {cfg.services
                .filter((s) => s.sectionId === sec.id)
                .sort((a, b) => a.order - b.order)
                .map((s) => {
                  const m = menuService(s.id);
                  const differs = m ? !samePrice(m.price, s.price) : true;
                  return (
                    <li key={s.id} className="admin-gr-service" data-inactive={!s.active || undefined}>
                      <div className="admin-gr-service__head">
                        <input className="admin-gr-service__name" aria-label="Service name" value={s.name} onChange={(e) => setService(s.id, { name: e.target.value })} />
                        {differs && <span className="admin-chip admin-chip--draft">{m ? "differs from menu" : "not on printed menu"}</span>}
                        <label className="admin-check">
                          <input type="checkbox" checked={s.active} onChange={(e) => setService(s.id, { active: e.target.checked })} /> Active
                        </label>
                      </div>
                      {m && differs && <p className="admin-hint">Printed menu: {priceText(m.price, cfg.sizeBands)}</p>}
                      <div className="admin-gr-service__grid">
                        <label className="admin-field">
                          <span>Price type</span>
                          <select
                            value={s.price.type}
                            onChange={(e) =>
                              setService(s.id, {
                                price: e.target.value === "flat" ? { type: "flat", cents: (s.price.type === "by_size" ? Object.values(s.price.bands)[0] : undefined) ?? 10000 } : { type: "by_size", bands: { small: s.price.type === "flat" ? s.price.cents : 10000 } },
                                ...(e.target.value === "by_size" ? { species: ["dog"] as GroomingService["species"] } : {}),
                              })
                            }
                          >
                            <option value="flat">One price</option>
                            <option value="by_size">By dog size</option>
                          </select>
                        </label>
                        {s.price.type === "flat" ? (
                          <label className="admin-field">
                            <span>Price (₹)</span>
                            <input type="number" min={1} step="1" value={rupees(s.price.cents)} onChange={(e) => setService(s.id, { price: { type: "flat", cents: toCents(e.target.value) ?? 0 } })} />
                          </label>
                        ) : (
                          SIZE_BANDS.map((band: SizeBand) => (
                            <label key={band} className="admin-field">
                              <span>{cfg.sizeBands.find((b) => b.id === band)?.label ?? band} (₹)</span>
                              <input
                                type="number"
                                min={1}
                                value={s.price.type === "by_size" ? rupees(s.price.bands[band]) : ""}
                                placeholder="ask us"
                                onChange={(e) => {
                                  if (s.price.type !== "by_size") return;
                                  const bands = { ...s.price.bands };
                                  const v = toCents(e.target.value);
                                  if (v === undefined) delete bands[band];
                                  else bands[band] = v;
                                  setService(s.id, { price: { type: "by_size", bands } });
                                }}
                              />
                            </label>
                          ))
                        )}
                        <label className="admin-field">
                          <span>Duration (slots)</span>
                          <input
                            type="number"
                            min={1}
                            max={32}
                            value={s.slotsNeeded ?? ""}
                            placeholder="not set"
                            onChange={(e) => setService(s.id, { slotsNeeded: e.target.value === "" ? null : Number(e.target.value) })}
                          />
                        </label>
                        <fieldset className="admin-field">
                          <legend>For</legend>
                          {(["dog", "cat"] as const).map((sp) => (
                            <label key={sp} className="admin-check">
                              <input
                                type="checkbox"
                                checked={s.species.includes(sp)}
                                onChange={(e) => setService(s.id, { species: e.target.checked ? [...s.species, sp] : s.species.filter((x) => x !== sp) })}
                              />{" "}
                              {sp === "dog" ? "Dogs" : "Cats"}
                            </label>
                          ))}
                        </fieldset>
                        <label className="admin-field">
                          <span>Can be added as an extra</span>
                          <select value={s.role} onChange={(e) => setService(s.id, { role: e.target.value as GroomingService["role"] })}>
                            <option value="main_or_extra">Yes (main or extra)</option>
                            <option value="main_only">No (main service only)</option>
                          </select>
                        </label>
                      </div>
                      <label className="admin-field">
                        <span>Short line (e.g. All coat)</span>
                        <input value={s.subtitle ?? ""} onChange={(e) => setService(s.id, { subtitle: e.target.value || undefined })} />
                      </label>
                      <label className="admin-field">
                        <span>Description (“What&apos;s included”)</span>
                        <textarea rows={3} value={s.description} onChange={(e) => setService(s.id, { description: e.target.value })} />
                      </label>
                      <label className="admin-field">
                        <span>Condition / eligibility (shown highlighted)</span>
                        <input value={s.condition ?? ""} onChange={(e) => setService(s.id, { condition: e.target.value || undefined })} />
                      </label>
                    </li>
                  );
                })}
            </ul>
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => addService(sec.id)}>
              + Add a service to {sec.title}
            </button>
          </div>
        ))}
    </section>
  );
}
