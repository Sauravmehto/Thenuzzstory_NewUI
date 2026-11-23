import { formatRupees } from "./money";
import type { Estimate, GroomingBooking, PricingConfig } from "./types";

/*
 * WhatsApp message texts. Opening a pre-filled link is NOT proof a message
 * was sent: the UI only ever says "WhatsApp opened".
 */

const DAY = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function formatDate(date: string): string {
  return DAY.format(new Date(`${date}T00:00:00Z`));
}

export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export const formatSlot = (slot: { date: string; start: string }) => `${formatDate(slot.date)}, ${formatTime(slot.start)}`;

export function serviceNames(services: { mainId: string; extraIds: string[] }, pricing: PricingConfig): string {
  const name = (id: string) => pricing.services.find((s) => s.id === id)?.name ?? id;
  return [services.mainId, ...services.extraIds].map(name).join(" + ");
}

export const estimateText = (e: Estimate | null) => (e ? `${formatRupees(e.totalCents)} (estimate)` : "Custom quote on the call");

export type CustomerTemplate = "received" | "confirmed" | "rescheduled" | "cancelled";

export const TEMPLATE_LABEL: Record<CustomerTemplate, string> = {
  received: "Request received",
  confirmed: "Confirmed",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
};

/** Customer → store: the saved booking, so the team has it in the chat too. */
export function customerToStoreMessage(b: GroomingBooking, pricing: PricingConfig): string {
  return [
    `*Grooming appointment request: ${b.bookingId}*`,
    `Pet: ${b.pet.name} (${b.pet.breedOther ?? b.pet.breedName}, ${b.pet.species})`,
    `Service: ${serviceNames(b.services, pricing)}`,
    `Requested: ${formatSlot(b.requested)}`,
    `Estimate: ${estimateText(b.estimate)}`,
    `Name: ${b.customer.name}`,
    "",
    "Please call me to confirm. Thank you!",
  ].join("\n");
}

/** Store → customer templates (admin booking page). */
export function storeToCustomerMessage(t: CustomerTemplate, b: GroomingBooking, pricing: PricingConfig): string {
  const first = b.customer.name.split(" ")[0];
  const service = serviceNames(b.services, pricing);
  const slot = formatSlot(b.appointment);
  switch (t) {
    case "received":
      return `Hi ${first}, this is The Nuzz Story. We've received your grooming request (${b.bookingId}) for ${b.pet.name}: ${service}, ${slot}. We'll call you shortly to confirm.`;
    case "confirmed":
      return `Hi ${first}, ${b.pet.name}'s grooming at The Nuzz Story is confirmed for ${slot} (${service}). Booking ${b.bookingId}. See you soon!`;
    case "rescheduled":
      return `Hi ${first}, as discussed, ${b.pet.name}'s grooming at The Nuzz Story is now on ${slot} (${service}). Booking ${b.bookingId}.`;
    case "cancelled":
      return `Hi ${first}, ${b.pet.name}'s grooming appointment ${b.bookingId} at The Nuzz Story has been cancelled. Message us anytime to book a new time.`;
  }
}
