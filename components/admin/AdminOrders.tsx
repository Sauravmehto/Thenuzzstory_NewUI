"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatPrice } from "@/lib/money";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, type SavedOrder } from "@/lib/order-types";
import type { OrderStatus, PaymentStatus } from "@/lib/types";
import { Callout, EmptyState, PageHeader, StatCards, StatusTabs, type Tone } from "@/components/admin/AdminUI";

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; orders: SavedOrder[] };
type StatusFilter = "all" | OrderStatus;

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

const STATUSES = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];
const STATUS_TONE: Record<OrderStatus, Tone> = {
  pending_confirmation: "amber",
  confirmed: "blue",
  shipped: "violet",
  delivered: "green",
  cancelled: "grey",
};
const STATUS_CHIP: Record<OrderStatus, string> = {
  pending_confirmation: "draft",
  confirmed: "main",
  shipped: "coming_soon",
  delivered: "active",
  cancelled: "archived",
};

export default function AdminOrders() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/orders", { credentials: "same-origin", cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { ok: boolean; orders?: SavedOrder[]; message?: string } | null;
      if (res.status === 401) return window.location.assign("/admin/login?next=/admin/orders");
      if (!data?.ok || !data.orders) return setLoad({ state: "error", message: data?.message ?? `Couldn't load orders (error ${res.status}).` });
      setLoad({ state: "ready", orders: data.orders });
    } catch {
      setLoad({ state: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const change = async (order: SavedOrder, patch: { status?: OrderStatus; paymentStatus?: PaymentStatus }) => {
    setBusy(order.orderId);
    setNotice("");
    try {
      const res = await fetch(`/api/admin/orders/${order.orderId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => null)) as { ok: boolean; order?: SavedOrder; message?: string } | null;
      if (!data?.ok || !data.order) setNotice(data?.message ?? "Couldn't save the change.");
      else {
        const saved = data.order;
        setLoad((l) => (l.state === "ready" ? { state: "ready", orders: l.orders.map((o) => (o.orderId === saved.orderId ? saved : o)) } : l));
        setNotice(`${saved.orderId} updated.`);
      }
    } catch {
      setNotice("Couldn't reach the server. Nothing was changed.");
    } finally {
      setBusy(null);
    }
  };

  const orders = load.state === "ready" ? load.orders : [];
  const counts = Object.fromEntries(STATUSES.map((s) => [s, orders.filter((o) => o.status === s).length])) as Record<OrderStatus, number>;
  const q = query.trim().toLowerCase();
  const visible = orders
    .filter((o) => status === "all" || o.status === status)
    .filter((o) => !q || [o.orderId, o.customer.name, o.customer.phone, o.customer.email].join(" ").toLowerCase().includes(q));

  return (
    <section aria-labelledby="admin-orders-title">
      <PageHeader
        id="admin-orders-title"
        title="Orders"
        description="Orders customers placed on the website. Call the customer, then update the order and payment status here."
        actions={
          <button type="button" className="admin-btn" onClick={() => void refresh()}>
            ↻ Refresh
          </button>
        }
      />

      <Callout tone="warn">
        A saved order doesn&apos;t prove the customer sent the WhatsApp message. Call them to confirm before you ship.
      </Callout>

      {load.state === "ready" && orders.length > 0 && (
        <StatCards<StatusFilter>
          label="Orders by status (click to filter)"
          selected={status}
          onSelect={(k) => setStatus((cur) => (cur === k ? "all" : k))}
          stats={[
            { key: "pending_confirmation", label: "To confirm", value: counts.pending_confirmation, hint: "call the customer", tone: "amber" },
            { key: "confirmed", label: "Confirmed", value: counts.confirmed, hint: "ready to pack", tone: "blue" },
            { key: "shipped", label: "Shipped", value: counts.shipped, hint: "on the way", tone: "violet" },
            { key: "delivered", label: "Delivered", value: counts.delivered, hint: "completed", tone: "green" },
          ]}
        />
      )}

      <div className="admin-filterbar">
        <StatusTabs<StatusFilter>
          label="Order status"
          value={status}
          onChange={setStatus}
          tabs={[{ key: "all", label: "All", count: orders.length }, ...STATUSES.map((s) => ({ key: s, label: ORDER_STATUS_LABEL[s], count: counts[s] }))]}
        />
        <div className="admin-filters">
          <label className="admin-search">
            <span className="visually-hidden">Search orders</span>
            <input type="search" placeholder="Search by order ID, name, phone, email…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
      </div>

      <p className="admin-count" role="status">
        {notice || (load.state === "ready" ? `Showing ${visible.length} of ${orders.length} orders` : "")}
      </p>

      {load.state === "loading" && <EmptyState icon="⏳" title="Loading orders…" />}
      {load.state === "error" && (
        <EmptyState
          icon="⚠️"
          role="alert"
          title="Couldn't load orders"
          action={
            <button type="button" className="admin-btn admin-btn--sm" onClick={() => void refresh()}>
              Try again
            </button>
          }
        >
          {load.message}
        </EmptyState>
      )}
      {load.state === "ready" && visible.length === 0 &&
        (orders.length ? (
          <EmptyState icon="🔍" title="No orders match">
            Try another search or status.
          </EmptyState>
        ) : (
          <EmptyState
            icon="🧾"
            title="No orders yet"
            action={
              <Link href="/shop" className="admin-btn">
                View the shop ↗
              </Link>
            }
          >
            When a customer checks out, their order shows up here.
          </EmptyState>
        ))}

      {load.state === "ready" && visible.length > 0 && (
        <ul className="admin-list">
          {visible.map((o) => (
            <li key={o.orderId} className="admin-order" data-order-id={o.orderId} data-status={o.status}>
              <div className="admin-order__head">
                <code className="admin-order__id">{o.orderId}</code>
                <span className={`admin-chip admin-chip--${STATUS_CHIP[o.status]}`}>{ORDER_STATUS_LABEL[o.status]}</span>
                <span className={`admin-chip admin-chip--${o.paymentStatus === "paid" ? "active" : "pay"}`}>{PAYMENT_STATUS_LABEL[o.paymentStatus]}</span>
                <span className="admin-order__when admin-muted">{when(o.createdAt)}</span>
                <strong className="admin-order__total">{formatPrice(o.totalCents)}</strong>
              </div>
              <div className="admin-order__body">
                <div className="admin-order__col">
                  <p className="admin-order__label">Customer</p>
                  <p>
                    <strong>{o.customer.name}</strong>
                    <span className="admin-muted">{o.userId ? " · signed-in customer" : " · guest"}</span>
                  </p>
                  <p>
                    <a href={`tel:+91${o.customer.phone}`} className="admin-nowrap">
                      +91 {o.customer.phone.slice(0, 5)} {o.customer.phone.slice(5)}
                    </a>{" "}
                    · {o.customer.email}
                  </p>
                  <p>
                    {o.customer.address}, {o.customer.city}, {o.customer.state} {o.customer.pin}
                  </p>
                  <p className="admin-muted">Payment method: WhatsApp (pay as arranged)</p>
                </div>
                <div className="admin-order__col">
                  <p className="admin-order__label">Items</p>
                  <ul className="admin-order__lines">
                    {o.lines.map((l) => (
                      <li key={l.id}>
                        <span>
                          {l.packLabel ? `${l.name.replace(` · ${l.packLabel}`, "")} (${l.packLabel})` : l.name} × {l.qty}
                          <span className="admin-muted"> · {formatPrice(l.unitCents)} each</span>
                        </span>
                        <strong>{formatPrice(l.lineCents)}</strong>
                      </li>
                    ))}
                    <li className="admin-order__sum admin-muted">
                      <span>
                        Subtotal {formatPrice(o.subtotalCents)} · Delivery {o.shippingCents === 0 ? "Free" : formatPrice(o.shippingCents)}
                      </span>
                      <strong>Total {formatPrice(o.totalCents)}</strong>
                    </li>
                  </ul>
                </div>
                <div className="admin-order__col admin-order__actions">
                  <p className="admin-order__label">Update</p>
                  <label className="admin-field">
                    <span>Order status</span>
                    <select value={o.status} disabled={busy === o.orderId} onChange={(e) => void change(o, { status: e.target.value as OrderStatus })}>
                      {STATUSES.map((k) => (
                        <option key={k} value={k}>
                          {ORDER_STATUS_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-field">
                    <span>Payment</span>
                    <select
                      value={o.paymentStatus}
                      disabled={busy === o.orderId}
                      onChange={(e) => void change(o, { paymentStatus: e.target.value as PaymentStatus })}
                    >
                      {(Object.keys(PAYMENT_STATUS_LABEL) as PaymentStatus[]).map((k) => (
                        <option key={k} value={k}>
                          {PAYMENT_STATUS_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {busy === o.orderId && <span className="admin-muted">Saving…</span>}
                  {o.updatedAt && busy !== o.orderId && <span className="admin-muted">Updated {when(o.updatedAt)}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
