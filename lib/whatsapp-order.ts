import { formatPrice } from "./money";
import { STORE_MONEY, WHATSAPP_NUMBER } from "./store-config";
import type { SavedOrder } from "./order-types";
import { PAYMENT_OPTIONS } from "./payment-methods";

/**
 * The message the customer sends to the team. It is built from the SAVED order
 * (server-priced), never from what the browser claims, so the message and the
 * record always agree.
 *
 * WhatsApp formatting: *bold*. Line breaks are real newlines; the whole text
 * is URL-encoded once, in whatsappUrl().
 */
export function buildWhatsappMessage(order: SavedOrder): string {
  const { customer } = order;
  const lines = order.lines.map((l, i) => {
    const label = l.packLabel ? `${l.name.replace(` · ${l.packLabel}`, "")} (${l.packLabel})` : l.name;
    return `${i + 1}. ${label} × ${l.qty} — ${formatPrice(l.unitCents)} each = ${formatPrice(l.lineCents)}`;
  });
  const payment = PAYMENT_OPTIONS.find((o) => o.id === order.paymentMethod)?.receiptLabel ?? order.paymentMethod;
  const placed = new Date(order.createdAt).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });

  return [
    `*New order: ${order.orderId}*`,
    `Placed: ${placed} IST`,
    "",
    "*Customer*",
    `Name: ${customer.name}`,
    `Mobile: +91 ${customer.phone.slice(0, 5)} ${customer.phone.slice(5)}`,
    "",
    "*Delivery address*",
    customer.address,
    `${customer.city}, ${customer.state} ${customer.pin}`,
    "",
    "*Items*",
    ...lines,
    "",
    `Subtotal: ${formatPrice(order.subtotalCents)}`,
    `Delivery: ${order.shippingCents === 0 ? "Free" : formatPrice(order.shippingCents)}`,
    `*Total: ${formatPrice(order.totalCents)}*`,
    "",
    `Payment method: ${payment}`,
    "Payment status: pending (to be arranged with the team)",
    "",
    "Please confirm my order. Thank you!",
  ].join("\n");
}

/** Official click-to-chat link with the message encoded (wa.me works on phones and WhatsApp Web). */
export const whatsappUrl = (message: string, number: string = WHATSAPP_NUMBER) =>
  `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

/** For receipts and the account panel. */
export const currencyOf = () => STORE_MONEY.currency;
