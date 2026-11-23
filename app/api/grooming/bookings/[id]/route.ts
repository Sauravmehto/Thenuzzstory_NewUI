import type { NextRequest } from "next/server";
import { bookingForToken, publicBooking } from "@/lib/server/grooming-bookings";
import { fail, json } from "@/lib/server/grooming-http";
import { groomingStore } from "@/lib/server/grooming-store";

export const dynamic = "force-dynamic";

/** The customer's booking status (needs the private token from their status link). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const booking = await bookingForToken(await groomingStore(), id, req.nextUrl.searchParams.get("t"));
    if (!booking) return fail(404, "not_found", "We couldn't find that booking. Check the link, or call us.");
    return json({ ok: true, booking: publicBooking(booking) });
  } catch (err) {
    console.error("[grooming/bookings/id]", err);
    return fail(503, "storage_failed", "We couldn't load your booking right now. Please try again.");
  }
}
