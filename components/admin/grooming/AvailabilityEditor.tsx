"use client";

import { useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/admin-client";
import { addDays, availabilityProblems, availableStarts, storeNow } from "@/lib/grooming/availability";
import { formatDate, formatTime } from "@/lib/grooming/messages";
import { WEEKDAYS, type AvailabilityConfig, type PricingConfig, type Weekday } from "@/lib/grooming/types";

const DAY_LABEL: Record<Weekday, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

export default function AvailabilityEditor() {
  const [cfg, setCfg] = useState<AvailabilityConfig | null>(null);
  const [pricing, setPricing] = useState<PricingConfig | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; problems?: string[] } | null>(null);
  const [newClosed, setNewClosed] = useState({ date: "", reason: "" });
  const [newBlock, setNewBlock] = useState({ date: "", start: "", end: "", reason: "" });
  const [newOverride, setNewOverride] = useState({ date: "", capacity: "" });

  useEffect(() => {
    void (async () => {
      const res = await adminRequest<{ availability: AvailabilityConfig; pricing: PricingConfig }>("/api/admin/grooming/availability");
      if (!res.ok) return setError(res.message);
      setCfg(res.availability);
      setPricing(res.pricing);
    })();
  }, []);

  const problems = useMemo(() => (cfg ? availabilityProblems(cfg) : []), [cfg]);
  const missingDurations = pricing?.services.filter((s) => s.active && !s.slotsNeeded).map((s) => s.name) ?? [];

  if (error) return <p className="admin-empty" role="alert">{error}</p>;
  if (!cfg) return <p className="admin-empty">Loading…</p>;

  const set = (patch: Partial<AvailabilityConfig>) => setCfg({ ...cfg, ...patch });
  const setDay = (d: Weekday, ranges: AvailabilityConfig["weekly"][Weekday]) => set({ weekly: { ...cfg.weekly, [d]: ranges } });

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const res = await adminRequest<{ availability: AvailabilityConfig }>("/api/admin/grooming/availability", { method: "PUT", json: { availability: cfg } });
    setSaving(false);
    if (!res.ok) return setMessage({ tone: "error", text: res.message, problems: res.problems });
    setCfg(res.availability);
    setMessage({ tone: "ok", text: "Saved. The booking calendar uses these settings now." });
  };

  // Preview: the next 14 days, for a one-slot service, ignoring bookings.
  const today = storeNow().date;
  const preview = Array.from({ length: 14 }, (_, i) => addDays(today, i)).map((d) => availableStarts(d, 1, cfg, new Map()));

  return (
    <section aria-labelledby="gr-av-title">
      <div className="admin-toolbar">
        <h1 id="gr-av-title">Grooming availability</h1>
        <div className="admin-toolbar__actions">
          <button type="button" className="admin-btn admin-btn--primary" onClick={() => void save()} disabled={saving || problems.length > 0}>
            {saving ? "Saving…" : "Save availability"}
          </button>
        </div>
      </div>
      {message && (
        <div className={`admin-message admin-message--${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
          <p>{message.text}</p>
          {message.problems && message.problems.length > 1 && (
            <ul>
              {message.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {problems.length > 0 && (
        <div className="admin-warn" role="status">
          <p>Fix these before saving:</p>
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="admin-card">
        <label className="admin-check admin-gr-switch">
          <input type="checkbox" checked={cfg.bookingEnabled} onChange={(e) => set({ bookingEnabled: e.target.checked })} />
          <span>
            <strong>Online booking is {cfg.bookingEnabled ? "ON" : "OFF"}</strong>
            <span className="admin-muted"> · when off, customers see “call or WhatsApp us” instead of the calendar.</span>
          </span>
        </label>
        {missingDurations.length > 0 && (
          <p className="admin-warn">
            These services have no duration yet, so they can&apos;t be booked online: {missingDurations.join(", ")}. Set durations in <a href="/admin/grooming/pricing">Pricing</a>.
          </p>
        )}
      </div>

      <div className="admin-card">
        <h2 className="admin-subtitle">Slots &amp; capacity</h2>
        <div className="admin-field-row">
          <label className="admin-field">
            <span>Slot length</span>
            <select value={cfg.slotMinutes} onChange={(e) => set({ slotMinutes: Number(e.target.value) })}>
              {[15, 20, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Pets groomed at the same time</span>
            <input type="number" min={1} max={20} value={cfg.capacityPerSlot} onChange={(e) => set({ capacityPerSlot: Number(e.target.value) })} />
          </label>
          <label className="admin-field">
            <span>Minimum notice (hours)</span>
            <input type="number" min={0} max={168} step={0.5} value={cfg.minNoticeMinutes / 60} onChange={(e) => set({ minNoticeMinutes: Math.round(Number(e.target.value) * 60) })} />
          </label>
          <label className="admin-field">
            <span>Customers can book up to (days ahead)</span>
            <input type="number" min={1} max={180} value={cfg.maxDaysAhead} onChange={(e) => set({ maxDaysAhead: Number(e.target.value) })} />
          </label>
        </div>
        <p className="admin-hint">A service&apos;s duration is a number of slots (set per service in Pricing). Pending requests hold their slots until you confirm, cancel or reject them.</p>
      </div>

      <div className="admin-card">
        <h2 className="admin-subtitle">Opening hours</h2>
        <div className="admin-gr-week">
          {WEEKDAYS.map((d) => {
            const ranges = cfg.weekly[d];
            return (
              <div key={d} className="admin-gr-week__row">
                <label className="admin-check">
                  <input type="checkbox" checked={!!ranges} onChange={(e) => setDay(d, e.target.checked ? [{ open: "", close: "" }] : null)} />
                  <span>{DAY_LABEL[d]}</span>
                </label>
                {ranges ? (
                  <div className="admin-gr-week__ranges">
                    {ranges.map((r, i) => (
                      <span key={i} className="admin-gr-range">
                        <input type="time" aria-label={`${DAY_LABEL[d]} opens`} value={r.open} step={300} onChange={(e) => setDay(d, ranges.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)))} />
                        –
                        <input type="time" aria-label={`${DAY_LABEL[d]} closes`} value={r.close} step={300} onChange={(e) => setDay(d, ranges.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)))} />
                        {ranges.length > 1 && (
                          <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={() => setDay(d, ranges.filter((_, j) => j !== i))} aria-label="Remove range">
                            ✕
                          </button>
                        )}
                      </span>
                    ))}
                    {ranges.length < 4 && (
                      <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={() => setDay(d, [...ranges, { open: "", close: "" }])}>
                        + add break / second range
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="admin-muted">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="admin-card">
        <h2 className="admin-subtitle">Holidays &amp; closed dates</h2>
        <ul className="admin-gr-items">
          {cfg.closedDates.map((c) => (
            <li key={c.date}>
              {formatDate(c.date)} {c.reason && <span className="admin-muted">· {c.reason}</span>}
              <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={() => set({ closedDates: cfg.closedDates.filter((x) => x.date !== c.date) })}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="admin-gr-add">
          <input type="date" aria-label="Closed date" value={newClosed.date} onChange={(e) => setNewClosed({ ...newClosed, date: e.target.value })} />
          <input type="text" aria-label="Reason" placeholder="Reason (e.g. Diwali)" value={newClosed.reason} onChange={(e) => setNewClosed({ ...newClosed, reason: e.target.value })} />
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            disabled={!newClosed.date}
            onClick={() => {
              set({ closedDates: [...cfg.closedDates.filter((x) => x.date !== newClosed.date), { date: newClosed.date, reason: newClosed.reason.trim() }] });
              setNewClosed({ date: "", reason: "" });
            }}
          >
            Add closed date
          </button>
        </div>
      </div>

      <div className="admin-card">
        <h2 className="admin-subtitle">Blocked times</h2>
        <ul className="admin-gr-items">
          {cfg.blockedSlots.map((s, i) => (
            <li key={`${s.date}-${s.start}-${i}`}>
              {formatDate(s.date)}, {formatTime(s.start)}–{formatTime(s.end)} {s.reason && <span className="admin-muted">· {s.reason}</span>}
              <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={() => set({ blockedSlots: cfg.blockedSlots.filter((_, j) => j !== i) })}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="admin-gr-add">
          <input type="date" aria-label="Blocked date" value={newBlock.date} onChange={(e) => setNewBlock({ ...newBlock, date: e.target.value })} />
          <input type="time" aria-label="From" value={newBlock.start} onChange={(e) => setNewBlock({ ...newBlock, start: e.target.value })} />
          <input type="time" aria-label="To" value={newBlock.end} onChange={(e) => setNewBlock({ ...newBlock, end: e.target.value })} />
          <input type="text" aria-label="Reason" placeholder="Reason (optional)" value={newBlock.reason} onChange={(e) => setNewBlock({ ...newBlock, reason: e.target.value })} />
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            disabled={!newBlock.date || !newBlock.start || !newBlock.end}
            onClick={() => {
              set({ blockedSlots: [...cfg.blockedSlots, { ...newBlock, reason: newBlock.reason.trim() }] });
              setNewBlock({ date: "", start: "", end: "", reason: "" });
            }}
          >
            Block time
          </button>
        </div>
      </div>

      <div className="admin-card">
        <h2 className="admin-subtitle">Capacity for a specific date</h2>
        <p className="admin-hint">E.g. one groomer on leave: set that day to fewer pets at a time. 0 closes the day for new bookings.</p>
        <ul className="admin-gr-items">
          {cfg.capacityOverrides.map((o) => (
            <li key={o.date}>
              {formatDate(o.date)}: {o.capacity} at a time
              <button type="button" className="admin-btn admin-btn--sm admin-btn--ghost" onClick={() => set({ capacityOverrides: cfg.capacityOverrides.filter((x) => x.date !== o.date) })}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="admin-gr-add">
          <input type="date" aria-label="Date" value={newOverride.date} onChange={(e) => setNewOverride({ ...newOverride, date: e.target.value })} />
          <input type="number" min={0} max={20} aria-label="Pets at a time" placeholder="Pets at a time" value={newOverride.capacity} onChange={(e) => setNewOverride({ ...newOverride, capacity: e.target.value })} />
          <button
            type="button"
            className="admin-btn admin-btn--sm"
            disabled={!newOverride.date || newOverride.capacity === ""}
            onClick={() => {
              set({ capacityOverrides: [...cfg.capacityOverrides.filter((x) => x.date !== newOverride.date), { date: newOverride.date, capacity: Number(newOverride.capacity) }] });
              setNewOverride({ date: "", capacity: "" });
            }}
          >
            Set capacity
          </button>
        </div>
      </div>

      <div className="admin-card">
        <h2 className="admin-subtitle">Preview: next 14 days</h2>
        <p className="admin-hint">Start times for a one-slot service with these settings (before any bookings). Save to apply.</p>
        <ul className="admin-gr-preview">
          {preview.map((d) => (
            <li key={d.date}>
              <strong>{formatDate(d.date)}</strong>{" "}
              {d.starts.length ? (
                <span>
                  {d.starts.length} start times, {formatTime(d.starts[0]!)}–{formatTime(d.starts.at(-1)!)}
                </span>
              ) : (
                <span className="admin-muted">{d.closedReason ?? "Closed"}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
