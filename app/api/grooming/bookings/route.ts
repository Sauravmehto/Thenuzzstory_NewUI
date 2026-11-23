import type { NextRequest } from "next/server";
import { customerToStoreMessage } from "@/lib/grooming/messages";
import { isBookingRequestShape } from "@/lib/grooming/validation";
import { requireSameOrigin } from "@/lib/server/auth";
import { createBooking, publicBooking } from "@/lib/server/grooming-bookings";
import { getAvailability, getPricing } from "@/lib/server/grooming-config";
import { clientIp, fail, json, readJsonBody, throttled } from "@/lib/server/grooming-http";
import { groomingStore } from "@/lib/server/grooming-store";
import { whatsappUrl } from "@/lib/whatsapp-order";

export const dynamic = "force-dynamic";

/**
 * Request a grooming appointment. The server re-validates every field,
 * re-prices from its own config, and claims the calendar seat(s) atomically.
 * The booking is saved as PENDING CONFIRMATION: the team calls to confirm.
 */
export async function POST(req: NextRequest) {
  const blocked = requireSameOrigin(req);
  if (blocked) return blocked;

  const body = await readJsonBody(req, 20_000);
  if (!isBookingRequestShape(body)) return fail(400, "invalid_request", "Something went wrong with the form. Please reload the page and try again.");
  // Honeypot: a hidden field only bots fill in.
  if (body.website) return fail(400, "invalid_request", "Something went wrong with the form. Please reload the page and try again.");
  if (throttled(`grooming-booking:${clientIp(req)}`, 6, 10 * 60_000))
    return fail(429, "too_many_requests", "That's a lot of requests in a short time. Please wait a few minutes, or call us to book.");

  try {
    const store = await groomingStore();
    const [pricing, availability] = await Promise.all([getPricing(store), getAvailability(store)]);
    const result = await createBooking(store, {
      request: body,
      pricing,
      availability,
      idempotencyKey: req.headers.get("idempotency-key"),
    });
    if (!result.ok) {
      const { status, ok: _ok, ...rest } = result;
      return json({ ok: false, ...rest }, status);
    }
    const { booking, token, replay } = result;
    return json(
      {
        ok: true,
        replay,
        booking: publicBooking(booking),
        statusUrl: token ? `/grooming/booking/${booking.bookingId}?t=${token}` : null,
        whatsappUrl: whatsappUrl(customerToStoreMessage(booking, pricing)),
      },
      replay ? 200 : 201,
    );
  } catch (err) {
    console.error("[grooming/bookings] create failed", err);
    return fail(503, "storage_failed", "We couldn't save your request. Nothing was booked: please try again in a moment, or call us.");
  }
}
