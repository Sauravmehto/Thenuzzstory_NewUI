import type { CheckoutCustomer, Cents, OrderStatus, PaymentMethod, PaymentStatus } from "./types";

/**
 * An order as saved on the server. Prices and totals are the server's own
 * (from the live catalog); the browser only ever sends what it was shown.
 */
export interface SavedOrder {
  orderId: string;
  createdAt: string;
  /** Set when the team changes status from the admin. */
  updatedAt?: string;
  /** Where the order stands in OUR process. Starts as pending_confirmation. */
  status: OrderStatus;
  /** Tracked separately. Starts as payment_pending: opening WhatsApp never changes it. */
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  customer: CheckoutCustomer;
  lines: {
    /** Pack SKU or product id, as sold. */
    id: string;
    /** The product the line belongs to (for packs). */
    productId: string;
    name: string;
    packLabel?: string;
    qty: number;
    unitCents: Cents;
    lineCents: Cents;
  }[];
  subtotalCents: Cents;
  shippingCents: Cents;
  totalCents: Cents;
  currency: string;
  /** Set when the customer was signed in (links the order to their account history). */
  userId?: string;
  source: "web";
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_confirmation: "Pending Confirmation",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  payment_pending: "Payment Pending",
  paid: "Paid",
  refunded: "Refunded",
};
