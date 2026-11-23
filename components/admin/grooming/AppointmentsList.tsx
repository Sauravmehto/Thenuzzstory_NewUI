"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminRequest } from "@/lib/admin-client";
import { PageHeader, StatCards } from "@/components/admin/AdminUI";
import { capacityOn, openSlots, storeNow, toMinutes } from "@/lib/grooming/availability";
import { formatDate, formatSlot, formatTime, serviceNames } from "@/lib/grooming/messages";
import { formatRupees } from "@/lib/grooming/money";
import { BOOKING_STATUS_LABEL, type AvailabilityConfig, type BookingStatus, type GroomingBooking, type PricingConfig } from "@/lib/grooming/types";

type Tab = "pending" | "confirmed" | "rescheduled" | "closed" | "completed" | "all";
const TABS: { id: Tab; label: string; match: (b: GroomingBooking) => boolean }[] = [
  { id: "pending", label: "Pending", match: (b) => b.status === "pending_confirmation" },
  { id: "confirmed", label: "Confirmed", match: (b) => b.status === "confirmed" },
  { id: "rescheduled", label: "Rescheduled", match: (b) => b.rescheduled && (b.status === "pending_confirmation" || b.status === "confirmed") },
  { id: "closed", label: "Cancelled / rejected", match: (b) => b.status === "cancelled" || b.status === "rejected" },
  { id: "completed", label: "Completed", match: (b) => b.status === "completed" },
  { id: "all", label: "All", match: () => true },
];

export const statusChip = (s: BookingStatus) =>
  ({ pending_confirmation: "draft", confirmed: "active", completed: "main", cancelled: "archived", rejected: "archived" })[s];

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
export const phoneText = (p: string) => `+91 ${p.slice(0, 5)} ${p.slice(5)}`;

export default function AppointmentsList() {
  const [data, setData] = useState<{ bookings: GroomingBooking[]; pricing: PricingConfig; availability: AvailabilityConfig } | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("pending");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [day, setDay] = useState(() => storeNow().date);
  const [view, setView] = useState<"list" | "day">("list");

  const load = useCallback(async () => {
    setError("");
    const res = await adminRequest<{ bookings: GroomingBooking[]; pricing: PricingConfig; availability: AvailabilityConfig }>("/api/admin/grooming/bookings");
    if (!res.ok) return setError(res.message);
    setData({ bookings: res.bookings, pricing: res.pricing, availability: res.availability });
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const bookings = useMemo(() => data?.bookings ?? [], [data]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, bookings.filter(t.match).length])), [bookings]);
  const today = storeNow().date;
  const todayCount = bookings.filter(
    (b) => b.appointment.date === today && (b.status === "pending_confirmation" || b.status === "confirmed" || b.status === "completed"),
  ).length;
  const q = query.trim().toLowerCase();
  const visible = bookings
    .filter(TABS.find((t) => t.id === tab)!.match)
    .filter((b) => !from || b.appointment.date >= from)
    .filter((b) => !to || b.appointment.date <= to)
    .filter((b) => !q || [b.bookingId, b.customer.name, b.customer.phone, b.customer.whatsapp, b.pet.name, b.pet.breedName, b.pet.breedOther ?? ""].join(" ").toLowerCase().includes(q))
    .sort((a, b) => (tab === "pending" ? a.createdAt.localeCompare(b.createdAt) : (a.appointment.date + a.appointment.start).localeCompare(b.appointment.date + b.appointment.start)));

  return (
    <section aria-labelledby="gr-admin-title">
      <PageHeader
        id="gr-admin-title"
        title="Grooming appointments"
        description={
          <>
            New requests arrive as <strong>Pending</strong> and hold their time slot. Call the customer, then open the booking to confirm,
            reschedule, cancel or reject it.
          </>
        }
        actions={
          <>
            <div className="admin-gr-toggle" role="group" aria-label="View">
              <button type="button" className="admin-btn admin-btn--sm" aria-pressed={view === "list"} onClick={() => setView("list")}>
                List
              </button>
              <button type="button" className="admin-btn admin-btn--sm" aria-pressed={view === "day"} onClick={() => setView("day")}>
                Day view
              </button>
            </div>
            <button type="button" className="admin-btn" onClick={() => void load()}>
              ↻ Refresh
            </button>
          </>
        }
      />
      {data && (
        <StatCards<Tab | "today">
          label="Appointments summary (click to filter)"
          selected={view === "list" ? tab : "today"}
          onSelect={(k) => {
            if (k === "today") {
              setDay(today);
              setView("day");
            } else {
              setView("list");
              setTab(k);
            }
          }}
          stats={[
            { key: "pending", label: "To confirm", value: counts.pending ?? 0, hint: "call these customers", tone: "amber" },
            { key: "today", label: "Today", value: todayCount, hint: "open the day view", tone: "blue" },
            { key: "confirmed", label: "Confirmed", value: counts.confirmed ?? 0, hint: "booked in", tone: "green" },
            { key: "completed", label: "Completed", value: counts.completed ?? 0, hint: "done", tone: "grey" },
          ]}
        />
      )}
      {data && !data.availability.bookingEnabled && (
        <p className="admin-warn">
          Online booking is <strong>off</strong>. Customers see a “call us” message until you set hours and turn it on in{" "}
          <Link href="/admin/grooming/availability">Availability</Link> (and set each service&apos;s duration in <Link href="/admin/grooming/pricing">Pricing</Link>).
        </p>
      )}

      {error && (
        <p className="admin-empty" role="alert">
          {error}{" "}
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => void load()}>
            Try again
          </button>
        </p>
      )}

      {view === "list" ? (
        <>
          <div className="admin-gr-tabs" role="tablist" aria-label="Status">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className="admin-gr-tab" onClick={() => setTab(t.id)}>
                {t.label} <span className="admin-gr-tab__count">{counts[t.id] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="admin-filters admin-gr-filters">
            <label>
              <span className="visually-hidden">Search bookings</span>
              <input type="search" placeholder="Search by booking ID, name, phone, pet…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <label>
              From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <p className="admin-count" role="status">
            {data ? `${visible.length} booking${visible.length === 1 ? "" : "s"}` : "Loading…"}
          </p>
          {data && visible.length === 0 && <p className="admin-empty">{bookings.length ? "Nothing matches." : "No grooming requests yet."}</p>}
          {data && visible.length > 0 && (
            <div className="admin-gr-table-wrap">
              <table className="admin-gr-table">
                <thead>
                  <tr>
                    <th scope="col">Booking</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Pet</th>
                    <th scope="col">Service</th>
                    <th scope="col">Estimate</th>
                    <th scope="col">Appointment</th>
                    <th scope="col">Status</th>
                    <th scope="col">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((b) => (
                    <tr key={b.bookingId} data-booking-id={b.bookingId}>
                      <td>
                        <Link href={`/admin/grooming/${b.bookingId}`} className="admin-gr-id">
                          {b.bookingId}
                        </Link>
                      </td>
                      <td>
                        <strong>{b.customer.name}</strong>
                        <br />
                        <a href={`tel:+91${b.customer.phone}`} className="admin-nowrap">{phoneText(b.customer.phone)}</a>
                      </td>
                      <td>
                        {b.pet.name}
                        <br />
                        <span className="admin-muted">{b.pet.breedOther ?? b.pet.breedName}</span>
                      </td>
                      <td>{serviceNames(b.services, data.pricing)}</td>
                      <td>{b.estimate ? formatRupees(b.estimate.totalCents) : "Custom quote"}</td>
                      <td>
                        {formatSlot(b.appointment)}
                        {b.rescheduled && <span className="admin-muted"> (moved)</span>}
                      </td>
                      <td>
                        <span className={`admin-chip admin-chip--${statusChip(b.status)}`}>{BOOKING_STATUS_LABEL[b.status]}</span>
                      </td>
                      <td className="admin-muted">{when(b.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        data && <DayView day={day} setDay={setDay} bookings={bookings} pricing={data.pricing} availability={data.availability} />
      )}
    </section>
  );
}

function DayView({
  day,
  setDay,
  bookings,
  pricing,
  availability,
}: {
  day: string;
  setDay: (d: string) => void;
  bookings: GroomingBooking[];
  pricing: PricingConfig;
  availability: AvailabilityConfig;
}) {
  const live = bookings.filter((b) => b.appointment.date === day && (b.status === "pending_confirmation" || b.status === "confirmed" || b.status === "completed"));
  const { starts, closedReason } = openSlots(day, availability);
  const capacity = capacityOn(day, availability);
  const covering = (time: string) =>
    live.filter((b) => {
      const s = toMinutes(b.appointment.start);
      const t = toMinutes(time);
      return t >= s && t < s + b.appointment.slots * availability.slotMinutes;
    });
  return (
    <div className="admin-gr-day">
      <div className="admin-filters">
        <label>
          Day <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </label>
        <span className="admin-muted">
          {formatDate(day)} · {capacity} pet{capacity === 1 ? "" : "s"} at a time
        </span>
      </div>
      {starts.length === 0 ? (
        <p className="admin-empty">
          {closedReason ?? "Closed"}. {live.length ? `${live.length} booking(s) still on this day.` : ""}
        </p>
      ) : (
        <ol className="admin-gr-timeline">
          {starts.map((t) => {
            const here = covering(t);
            return (
              <li key={t} data-full={here.length >= capacity || undefined}>
                <span className="admin-gr-timeline__time">{formatTime(t)}</span>
                <span className="admin-gr-timeline__load">
                  {here.length}/{capacity}
                </span>
                <span className="admin-gr-timeline__items">
                  {here.map((b) => (
                    <Link key={b.bookingId} href={`/admin/grooming/${b.bookingId}`} className={`admin-chip admin-chip--${statusChip(b.status)}`}>
                      {b.pet.name} · {serviceNames(b.services, pricing)}
                    </Link>
                  ))}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
