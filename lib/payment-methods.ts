import type { PaymentMethod } from "./types";

/**
 * The payment options shown at checkout. There is no payment gateway yet, so
 * WhatsApp is the only one: the order is saved on our server, then the
 * customer sends it to the team on WhatsApp and payment is arranged directly.
 *
 * To add a gateway later: add its id to PaymentMethod (lib/types.ts), add an
 * entry here, and handle it in app/api/orders/route.ts. The checkout form and
 * summary already render whatever is listed.
 */
export interface PaymentOption {
  id: PaymentMethod;
  label: string;
  description: string;
  /** Short text for receipts, e.g. "WhatsApp". */
  receiptLabel: string;
}

export const PAYMENT_OPTIONS: readonly PaymentOption[] = [
  {
    id: "whatsapp",
    label: "Order via WhatsApp — Pay as arranged",
    description:
      "We save your order, then open WhatsApp with the details filled in. Send the message to our team and we'll confirm payment and delivery with you directly. Nothing is charged on this website.",
    receiptLabel: "WhatsApp",
  },
];

export const DEFAULT_PAYMENT_METHOD: PaymentMethod = "whatsapp";
