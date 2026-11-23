import type { Metadata } from "next";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { STORE } from "@/lib/contact-places";
import { formatSlot, serviceNames } from "@/lib/grooming/messages";
import { formatRupees } from "@/lib/grooming/money";
import type { BookingStatus } from "@/lib/grooming/types";
import { bookingForToken, publicBooking } from "@/lib/server/grooming-bookings";
import { getPricing } from "@/lib/server/grooming-config";
import { groomingStore } from "@/lib/server/grooming-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your grooming request — The Nuzz Story",
  robots: { index: false, follow: false },
};

const COPY: Record<BookingStatus, { label: string; tone: string; text: string }> = {
  pending_confirmation: {
    label: "Pending confirmation",
    tone: "pending",
    text: "We've received your request. Our team will call you shortly to confirm the appointment. It isn't confirmed yet.",
  },
  confirmed: { label: "Confirmed", tone: "confirmed", text: "Your appointment is confirmed. See you at the store!" },
  completed: { label: "Completed", tone: "done", text: "This appointment is done. Thank you for visiting The Nuzz Story!" },
  cancelled: { label: "Cancelled", tone: "cancelled", text: "This appointment has been cancelled. Call or WhatsApp us to book a new time." },
  rejected: { label: "Not available", tone: "cancelled", text: "We couldn't take this request. Please call us and we'll find another option." },
};

/** The customer's private status page (link with a secret token, shown after booking). */
export default async function BookingStatusPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ id }, { t }] = await Promise.all([params, searchParams]);
  let view: ReturnType<typeof publicBooking> | null = null;
  let services = "";
  let failed = false;
  try {
    const store = await groomingStore();
    const booking = await bookingForToken(store, id, t ?? null);
    if (booking) {
      view = publicBooking(booking);
      services = serviceNames(booking.services, await getPricing(store));
    }
  } catch (err) {
    console.error("[grooming status page]", err);
    failed = true;
  }
  const copy = view ? COPY[view.status] : null;

  return (
    <div className="cozy-page grooming-page">
      <SiteHeader />
      <main id="main" className="gr-status-page">
        <div className="gr-status-card">
          {view && copy ? (
            <>
              <p className="gr-eyebrow">Grooming request</p>
              <h1 className="gr-title">
                {view.pet.name}&apos;s <em>appointment</em>
              </h1>
              <p className={`gr-status gr-status--${copy.tone}`}>{copy.label}</p>
              <p className="gr-status-card__text">{copy.text}</p>
              <dl className="gr-done__facts gr-done__facts--light">
                <div>
                  <dt>Booking ID</dt>
                  <dd>
                    <code>{view.bookingId}</code>
                  </dd>
                </div>
                <div>
                  <dt>{view.status === "pending_confirmation" ? "Requested time" : "Appointment"}</dt>
                  <dd>
                    {formatSlot(view.appointment)}
                    {view.rescheduled && view.status !== "cancelled" && <span className="gr-muted"> (moved, as agreed with you)</span>}
                  </dd>
                </div>
                <div>
                  <dt>Pet</dt>
                  <dd>
                    {view.pet.name} · {view.pet.breedName}
                  </dd>
                </div>
                <div>
                  <dt>Service</dt>
                  <dd>{services}</dd>
                </div>
                <div>
                  <dt>Estimate</dt>
                  <dd>{view.estimate ? `${formatRupees(view.estimate.totalCents)} (final price confirmed with you)` : "Custom quote"}</dd>
                </div>
              </dl>
              <p className="gr-status-card__help">
                Questions? Call <a href={STORE.phoneHref}>{STORE.phone}</a>.
              </p>
            </>
          ) : (
            <>
              <h1 className="gr-title">{failed ? "We couldn't load this right now" : "We couldn't find that request"}</h1>
              <p className="gr-status-card__text">
                {failed ? "Please try again in a moment." : "Check that you opened the full link from your booking."} You can also call us on{" "}
                <a href={STORE.phoneHref}>{STORE.phone}</a>.
              </p>
            </>
          )}
          <Link href="/grooming" className="gr-btn gr-btn--ghost">
            Back to grooming
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
