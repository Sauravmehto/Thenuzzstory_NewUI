"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Callout, EmptyState, PageHeader, StatCards } from "@/components/admin/AdminUI";
import { formatRupees } from "@/lib/grooming/money";
import { BOOKING_STATUS_LABEL, type BookingStatus, type GroomingBooking } from "@/lib/grooming/types";
import { formatPrice } from "@/lib/money";
import { ORDER_STATUS_LABEL, type SavedOrder } from "@/lib/order-types";
import type { OrderStatus } from "@/lib/types";

type DashboardData = {
  ok: true;
  today: string;
  overview: { pendingActions: number; todaySalesCents: number; totalSalesCents: number };
  orders: {
    total: number;
    today: number;
    pending: number;
    status: Record<OrderStatus, number>;
    salesTotalCents: number;
    salesTodayCents: number;
    recent: SavedOrder[];
  };
  grooming: {
    total: number;
    today: number;
    pending: number;
    status: Record<BookingStatus, number>;
    salesTotalCents: number;
    salesTodayCents: number;
    recent: GroomingBooking[];
  };
};

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: DashboardData };

const ORDER_STATUS_CHIP: Record<OrderStatus, string> = {
  pending_confirmation: "draft",
  confirmed: "main",
  shipped: "coming_soon",
  delivered: "active",
  cancelled: "archived",
};
const BOOKING_STATUS_CHIP: Record<BookingStatus, string> = {
  pending_confirmation: "draft",
  confirmed: "active",
  completed: "main",
  cancelled: "archived",
  rejected: "archived",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });

const apptWhen = (date: string, start: string) => {
  const stamp = new Date(`${date}T${start}:00+05:30`);
  return stamp.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
};

export default function AdminDashboard() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setNotice("");
    try {
      const res = await fetch("/api/admin/dashboard", { credentials: "same-origin", cache: "no-store" });
      const data = (await res.json().catch(() => null)) as DashboardData | { ok: false; message?: string } | null;
      if (res.status === 401) return window.location.assign("/admin/login?next=/admin/dashboard");
      if (!data || !("ok" in data) || !data.ok) return setLoad({ state: "error", message: data?.message ?? "Couldn't load dashboard." });
      setLoad({ state: "ready", data });
      setNotice(`Updated just now (${when(new Date().toISOString())})`);
    } catch {
      setLoad({ state: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const data = load.state === "ready" ? load.data : null;
  const cards = useMemo(() => {
    if (!data) return [];
    return [
      { key: "today-sales", label: "Today sales", value: formatRupees(data.overview.todaySalesCents), hint: "shop + grooming estimate", tone: "green" as const },
      { key: "pending", label: "Need action", value: data.overview.pendingActions, hint: "pending confirmations", tone: "amber" as const },
      { key: "orders-today", label: "Orders today", value: data.orders.today, hint: `${data.orders.total} total orders`, tone: "blue" as const },
      { key: "bookings-today", label: "Appointments today", value: data.grooming.today, hint: `${data.grooming.total} total appointments`, tone: "violet" as const },
    ];
  }, [data]);

  return (
    <section aria-labelledby="admin-dashboard-title">
      <PageHeader
        id="admin-dashboard-title"
        eyebrow="Overview"
        title="Dashboard"
        description="Live snapshot of orders, grooming appointments, and sales across the website."
        actions={
          <button type="button" className="admin-btn" onClick={() => void refresh()}>
            ↻ Refresh
          </button>
        }
      />

      <Callout tone="info">
        Sales on this page are based on saved orders plus grooming estimates. Cancelled/rejected requests are excluded.
      </Callout>

      {load.state === "loading" && <EmptyState icon="⏳" title="Loading dashboard…" />}
      {load.state === "error" && (
        <EmptyState
          icon="⚠️"
          role="alert"
          title="Couldn't load dashboard"
          action={
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => void refresh()}>
              Try again
            </button>
          }
        >
          {load.message}
        </EmptyState>
      )}

      {data && (
        <>
          <StatCards label="Dashboard highlights" stats={cards} />
          <p className="admin-count" role="status">
            {notice || `Snapshot date: ${data.today}`}
          </p>

          <div className="admin-dash-grid">
            <article className="admin-card admin-dash-card">
              <h2>Shop orders</h2>
              <p className="admin-dash-card__meta">Today: {formatPrice(data.orders.salesTodayCents)} · Total: {formatPrice(data.orders.salesTotalCents)}</p>
              <ul className="admin-dash-status">
                {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((status) => (
                  <li key={status}>
                    <span>{ORDER_STATUS_LABEL[status]}</span>
                    <span className={`admin-chip admin-chip--${ORDER_STATUS_CHIP[status]}`}>{data.orders.status[status]}</span>
                  </li>
                ))}
              </ul>
              <Link href="/admin/orders" className="admin-btn admin-btn--sm">
                Open orders
              </Link>
            </article>

            <article className="admin-card admin-dash-card">
              <h2>Grooming appointments</h2>
              <p className="admin-dash-card__meta">
                Today: {formatRupees(data.grooming.salesTodayCents)} · Total: {formatRupees(data.grooming.salesTotalCents)}
              </p>
              <ul className="admin-dash-status">
                {(Object.keys(BOOKING_STATUS_LABEL) as BookingStatus[]).map((status) => (
                  <li key={status}>
                    <span>{BOOKING_STATUS_LABEL[status]}</span>
                    <span className={`admin-chip admin-chip--${BOOKING_STATUS_CHIP[status]}`}>{data.grooming.status[status]}</span>
                  </li>
                ))}
              </ul>
              <Link href="/admin/grooming" className="admin-btn admin-btn--sm">
                Open appointments
              </Link>
            </article>
          </div>

          <div className="admin-dash-grid admin-dash-grid--activity">
            <article className="admin-card admin-dash-card">
              <h2>Recent orders</h2>
              {data.orders.recent.length === 0 ? (
                <p className="admin-muted">No orders yet.</p>
              ) : (
                <ul className="admin-dash-activity">
                  {data.orders.recent.map((order) => (
                    <li key={order.orderId}>
                      <div>
                        <Link href="/admin/orders" className="admin-dash-link">
                          {order.orderId}
                        </Link>
                        <p>{order.customer.name}</p>
                      </div>
                      <div>
                        <strong>{formatPrice(order.totalCents)}</strong>
                        <p className="admin-muted">{when(order.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="admin-card admin-dash-card">
              <h2>Recent appointments</h2>
              {data.grooming.recent.length === 0 ? (
                <p className="admin-muted">No appointments yet.</p>
              ) : (
                <ul className="admin-dash-activity">
                  {data.grooming.recent.map((booking) => (
                    <li key={booking.bookingId}>
                      <div>
                        <Link href={`/admin/grooming/${booking.bookingId}`} className="admin-dash-link">
                          {booking.bookingId}
                        </Link>
                        <p>
                          {booking.pet.name} · {booking.customer.name}
                        </p>
                      </div>
                      <div>
                        <strong>{booking.estimate ? formatRupees(booking.estimate.totalCents) : "Custom quote"}</strong>
                        <p className="admin-muted">{apptWhen(booking.appointment.date, booking.appointment.start)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </div>
        </>
      )}
    </section>
  );
}
