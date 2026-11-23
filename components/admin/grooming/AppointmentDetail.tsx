"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AvailabilityCalendar, { type LoadDays } from "@/components/grooming/AvailabilityCalendar";
import { adminRequest } from "@/lib/admin-client";
import { formatSlot, serviceNames, storeToCustomerMessage, TEMPLATE_LABEL, type CustomerTemplate } from "@/lib/grooming/messages";
import { formatRupees } from "@/lib/grooming/money";
import { BOOKING_STATUS_LABEL, type AvailabilityConfig, type BookingHistoryEntry, type DayAvailability, type GroomingBooking, type PricingConfig } from "@/lib/grooming/types";
import { whatsappUrl } from "@/lib/whatsapp-order";
import { phoneText, statusChip } from "./AppointmentsList";

type Data = { booking: GroomingBooking; pricing: PricingConfig; availability: AvailabilityConfig };
type Panel = null | "confirm" | "reschedule" | "cancel" | "reject" | "complete" | "note";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

const ACTION_TEXT: Record<BookingHistoryEntry["action"], string> = {
  created: "Request received from the website",
  confirm: "Confirmed",
  reschedule: "Rescheduled",
  cancel: "Cancelled",
  reject: "Rejected",
  complete: "Marked completed",
  note: "Note added",
  whatsapp_opened: "WhatsApp opened",
};

export default function AppointmentDetail({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [text, setText] = useState("");
  const [slot, setSlot] = useState<{ date: string; start: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    const res = await adminRequest<Data>(`/api/admin/grooming/bookings/${id}`);
    if (!res.ok) return setError(res.message);
    setData({ booking: res.booking, pricing: res.pricing, availability: res.availability });
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const loadDays: LoadDays = useCallback(
    async (from, to) => {
      const res = await adminRequest<{ days: DayAvailability[] }>(`/api/admin/grooming/bookings/${id}?from=${from}&to=${to}`);
      return res.ok ? { open: true, days: res.days ?? [] } : { error: res.message };
    },
    [id],
  );

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setMessage(null);
    const res = await adminRequest<{ booking: GroomingBooking }>(`/api/admin/grooming/bookings/${id}`, { method: "PATCH", json: body });
    setBusy(false);
    if (!res.ok) {
      setMessage({ tone: "error", text: res.message });
      if (res.code === "slot_unavailable") setReloadKey((k) => k + 1);
      return;
    }
    setData((d) => (d ? { ...d, booking: res.booking } : d));
    setPanel(null);
    setText("");
    setSlot(null);
    setMessage({ tone: "ok", text: done });
  };

  if (error)
    return (
      <p className="admin-empty" role="alert">
        {error} <Link href="/admin/grooming">Back to appointments</Link>
      </p>
    );
  if (!data) return <p className="admin-empty">Loading booking…</p>;
  const { booking: b, pricing } = data;
  const canConfirm = b.status === "pending_confirmation";
  const canMove = b.status === "pending_confirmation" || b.status === "confirmed";
  const openWhatsapp = (t: CustomerTemplate) => {
    window.open(whatsappUrl(storeToCustomerMessage(t, b, pricing), `91${b.customer.whatsapp}`), "_blank", "noopener");
    void act({ action: "whatsapp_opened", template: t }, `WhatsApp opened with the “${TEMPLATE_LABEL[t]}” message. Check it was sent in WhatsApp.`);
  };

  return (
    <section aria-labelledby="gr-detail-title" className="admin-gr-detail">
      <p className="admin-crumbs">
        <Link href="/admin/grooming">← Appointments</Link>
      </p>
      <div className="admin-toolbar">
        <h1 id="gr-detail-title">
          <code>{b.bookingId}</code>
        </h1>
        <span className={`admin-chip admin-chip--${statusChip(b.status)}`} data-testid="booking-status">
          {BOOKING_STATUS_LABEL[b.status]}
        </span>
        {b.rescheduled && <span className="admin-chip">Rescheduled</span>}
      </div>

      {message && (
        <p className={`admin-message admin-message--${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      )}

      <div className="admin-gr-detail__grid">
        <div className="admin-card">
          <h2 className="admin-subtitle">Appointment</h2>
          <dl className="admin-gr-dl">
            <dt>{b.status === "pending_confirmation" ? "Requested" : "Appointment"}</dt>
            <dd>
              <strong>{formatSlot(b.appointment)}</strong> ({b.appointment.slots * data.availability.slotMinutes} min)
            </dd>
            {b.rescheduled && (
              <>
                <dt>Originally requested</dt>
                <dd>{formatSlot(b.requested)}</dd>
              </>
            )}
            <dt>Service</dt>
            <dd>{serviceNames(b.services, pricing)}</dd>
            <dt>Estimate</dt>
            <dd>
              {b.estimate ? (
                <>
                  {formatRupees(b.estimate.totalCents)}{" "}
                  <span className="admin-muted">({b.estimate.lines.map((l) => `${l.name} ${formatRupees(l.cents)}`).join(" + ")})</span>
                </>
              ) : (
                "Custom quote (no fixed price for this pet)"
              )}
            </dd>
            <dt>Received</dt>
            <dd>{when(b.createdAt)}</dd>
          </dl>
        </div>
        <div className="admin-card">
          <h2 className="admin-subtitle">Customer &amp; pet</h2>
          <dl className="admin-gr-dl">
            <dt>Customer</dt>
            <dd>{b.customer.name}</dd>
            <dt>Mobile</dt>
            <dd>
              <a href={`tel:+91${b.customer.phone}`}>{phoneText(b.customer.phone)}</a>
            </dd>
            <dt>WhatsApp</dt>
            <dd>{phoneText(b.customer.whatsapp)}</dd>
            {b.customer.email && (
              <>
                <dt>Email</dt>
                <dd>{b.customer.email}</dd>
              </>
            )}
            <dt>Pet</dt>
            <dd>
              {b.pet.name} · {b.pet.species === "dog" ? "Dog" : "Cat"} · {b.pet.breedOther ?? b.pet.breedName}
            </dd>
            <dt>Size / weight</dt>
            <dd>
              {b.pet.weightKg ? `${b.pet.weightKg} kg` : "Weight not given"}
              {b.pet.sizeBand ? ` · ${pricing.sizeBands.find((s) => s.id === b.pet.sizeBand)?.label ?? b.pet.sizeBand}` : ""}
            </dd>
            {(b.pet.ageText || b.pet.coat) && (
              <>
                <dt>Age / coat</dt>
                <dd>{[b.pet.ageText, b.pet.coat].filter(Boolean).join(" · ")}</dd>
              </>
            )}
            {b.notes && (
              <>
                <dt>Customer notes</dt>
                <dd className="admin-gr-notes">{b.notes}</dd>
              </>
            )}
          </dl>
        </div>
      </div>

      <div className="admin-card">
        <h2 className="admin-subtitle">Actions</h2>
        <div className="admin-actions">
          {canConfirm && (
            <button type="button" className="admin-btn admin-btn--primary" onClick={() => setPanel("confirm")} disabled={busy}>
              Confirm appointment
            </button>
          )}
          {canMove && (
            <button type="button" className="admin-btn" onClick={() => setPanel("reschedule")} disabled={busy}>
              Reschedule
            </button>
          )}
          {b.status === "confirmed" && (
            <button type="button" className="admin-btn" onClick={() => setPanel("complete")} disabled={busy}>
              Mark completed
            </button>
          )}
          {canMove && (
            <button type="button" className="admin-btn admin-btn--danger" onClick={() => setPanel("cancel")} disabled={busy}>
              Cancel appointment
            </button>
          )}
          {canConfirm && (
            <button type="button" className="admin-btn admin-btn--danger" onClick={() => setPanel("reject")} disabled={busy}>
              Reject request
            </button>
          )}
          <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setPanel("note")} disabled={busy}>
            Add internal note
          </button>
        </div>

        {panel && (
          <form
            className="admin-gr-panel"
            onSubmit={(e) => {
              e.preventDefault();
              if (panel === "confirm") void act({ action: "confirm", note: text }, "Appointment confirmed.");
              if (panel === "complete") void act({ action: "complete", note: text }, "Marked as completed.");
              if (panel === "cancel") void act({ action: "cancel", reason: text }, "Appointment cancelled. The time slot is free again.");
              if (panel === "reject") void act({ action: "reject", reason: text }, "Request rejected. The time slot is free again.");
              if (panel === "note") void act({ action: "note", note: text }, "Note added.");
              if (panel === "reschedule" && slot) void act({ action: "reschedule", ...slot, note: text }, `Moved to ${formatSlot(slot)}.`);
            }}
          >
            {panel === "reschedule" && (
              <>
                <p className="admin-hint">
                  Pick the new time agreed with the customer ({b.appointment.slots * data.availability.slotMinutes} min). Full times are hidden; this
                  booking&apos;s own slot counts as free.
                </p>
                <div className="grooming-page admin-gr-cal">
                  <AvailabilityCalendar loadDays={loadDays} value={slot} onChange={setSlot} maxDaysAhead={180} reloadKey={reloadKey} label="New appointment date" />
                </div>
              </>
            )}
            <label className="admin-field">
              <span>
                {panel === "cancel" || panel === "reject" ? "Reason (kept in the history)" : panel === "note" ? "Note" : "Internal note (optional)"}
              </span>
              <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} required={panel === "cancel" || panel === "reject" || panel === "note"} />
            </label>
            <div className="admin-actions">
              <button
                type="submit"
                className={`admin-btn ${panel === "cancel" || panel === "reject" ? "admin-btn--danger" : "admin-btn--primary"}`}
                disabled={busy || (panel === "reschedule" && !slot)}
              >
                {busy
                  ? "Saving…"
                  : { confirm: "Confirm appointment", reschedule: "Save new time", cancel: "Cancel appointment", reject: "Reject request", complete: "Mark completed", note: "Add note" }[panel]}
              </button>
              <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setPanel(null)} disabled={busy}>
                Back
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="admin-card">
        <h2 className="admin-subtitle">WhatsApp the customer</h2>
        <p className="admin-hint">Opens WhatsApp with the message filled in. Opening it doesn&apos;t send it: press send in WhatsApp.</p>
        <div className="admin-actions">
          {(Object.keys(TEMPLATE_LABEL) as CustomerTemplate[]).map((t) => (
            <button key={t} type="button" className="admin-btn admin-btn--sm" onClick={() => openWhatsapp(t)} disabled={busy}>
              WhatsApp: {TEMPLATE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-gr-detail__grid">
        <div className="admin-card">
          <h2 className="admin-subtitle">History</h2>
          <ol className="admin-gr-history">
            {[...b.history].reverse().map((h, i) => (
              <li key={`${h.at}-${i}`}>
                <span className="admin-muted">{when(h.at)}</span> <strong>{ACTION_TEXT[h.action]}</strong>
                {h.slot && h.action === "reschedule" && h.previousSlot && (
                  <span>
                    {" "}
                    from {formatSlot(h.previousSlot)} to {formatSlot(h.slot)}
                  </span>
                )}
                {h.reason && <span> · reason: {h.reason}</span>}
                {h.note && <span> · {h.note}</span>}
              </li>
            ))}
          </ol>
        </div>
        <div className="admin-card">
          <h2 className="admin-subtitle">Internal notes</h2>
          {b.adminNotes.length === 0 ? (
            <p className="admin-muted">No notes yet.</p>
          ) : (
            <ul className="admin-gr-history">
              {b.adminNotes.map((n, i) => (
                <li key={`${n.at}-${i}`}>
                  <span className="admin-muted">{when(n.at)}</span> {n.text}
                </li>
              ))}
            </ul>
          )}
          {b.whatsappLog.length > 0 && (
            <p className="admin-muted">
              WhatsApp opened: {b.whatsappLog.map((w) => `${TEMPLATE_LABEL[w.template as CustomerTemplate] ?? w.template} (${when(w.at)})`).join(", ")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
