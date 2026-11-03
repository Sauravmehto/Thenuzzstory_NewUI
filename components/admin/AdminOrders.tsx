"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPrice } from "@/lib/money";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, type SavedOrder } from "@/lib/order-types";
import type { OrderStatus, PaymentStatus } from "@/lib/types";

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; orders: SavedOrder[] };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });

export default function AdminOrders() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");

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
  const q = query.trim().toLowerCase();
  const visible = q
    ? orders.filter((o) => [o.orderId, o.customer.name, o.customer.phone, o.customer.email].join(" ").toLowerCase().includes(q))
    : orders;

  return (
    <section aria-labelledby="admin-orders-title">
      <div className="admin-toolbar">
        <h1 id="admin-orders-title">Orders</h1>
        <button type="button" className="admin-btn" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>
      <p className="admin-muted">
        Orders placed on the website, read from the order store. A saved order means the customer reached the checkout and the server recorded it; it does not
        prove they sent the WhatsApp message, so confirm with the customer before shipping.
      </p>

      <div className="admin-filters">
        <label>
          <span className="visually-hidden">Search orders</span>
          <input type="search" placeholder="Search by order ID, name, phone, email…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <p className="admin-count" role="status">
        {notice || (load.state === "ready" ? `${visible.length} of ${orders.length} orders` : "")}
      </p>

      {load.state === "loading" && <p className="admin-empty">Loading orders…</p>}
      {load.state === "error" && (
        <p className="admin-empty" role="alert">
          {load.message}{" "}
          <button type="button" className="admin-btn admin-btn--sm" onClick={() => void refresh()}>
            Try again
          </button>
        </p>
      )}
      {load.state === "ready" && visible.length === 0 && <p className="admin-empty">{orders.length ? "No orders match your search." : "No orders yet."}</p>}

      {load.state === "ready" && visible.length > 0 && (
        <ul className="admin-list">
          {visible.map((o) => (
            <li key={o.orderId} className="admin-order" data-order-id={o.orderId}>
              <div className="admin-order__head">
                <code>{o.orderId}</code>
                <span className="admin-muted">{when(o.createdAt)}</span>
                <strong>{formatPrice(o.totalCents)}</strong>
                <span className={`admin-chip admin-chip--${o.status === "cancelled" ? "archived" : o.status === "pending_confirmation" ? "draft" : "active"}`}>
                  {ORDER_STATUS_LABEL[o.status]}
                </span>
                <span className="admin-chip admin-chip--coming_soon">{PAYMENT_STATUS_LABEL[o.paymentStatus]}</span>
              </div>
              <div className="admin-order__body">
                <div>
                  <p>
                    <strong>{o.customer.name}</strong>
                  </p>
                  <p>
                    +91 {o.customer.phone.slice(0, 5)} {o.customer.phone.slice(5)} · {o.customer.email}
                  </p>
                  <p>
                    {o.customer.address}, {o.customer.city}, {o.customer.state} {o.customer.pin}
                  </p>
                  <p className="admin-muted">Payment method: WhatsApp (pay as arranged){o.userId ? " · signed-in customer" : " · guest"}</p>
                </div>
                <ul className="admin-order__lines">
                  {o.lines.map((l) => (
                    <li key={l.id}>
                      {l.packLabel ? `${l.name.replace(` · ${l.packLabel}`, "")} (${l.packLabel})` : l.name} × {l.qty} · {formatPrice(l.unitCents)} each = {formatPrice(l.lineCents)}
                    </li>
                  ))}
                  <li className="admin-muted">
                    Subtotal {formatPrice(o.subtotalCents)} · Delivery {o.shippingCents === 0 ? "Free" : formatPrice(o.shippingCents)} · Total{" "}
                    {formatPrice(o.totalCents)}
                  </li>
                </ul>
              </div>
              <div className="admin-order__actions">
                <label>
                  Order status{" "}
                  <select value={o.status} disabled={busy === o.orderId} onChange={(e) => void change(o, { status: e.target.value as OrderStatus })}>
                    {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((k) => (
                      <option key={k} value={k}>
                        {ORDER_STATUS_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Payment{" "}
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
                {o.updatedAt && <span className="admin-muted">updated {when(o.updatedAt)}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
