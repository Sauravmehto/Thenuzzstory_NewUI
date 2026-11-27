import type { NextRequest } from "next/server";
import { slotsNeeded } from "@/lib/grooming/pricing";
import { availabilityWithStatesFor } from "@/lib/server/grooming-bookings";
import { getAvailability, getPricing } from "@/lib/server/grooming-config";
import { dateRange } from "@/lib/server/grooming-dates";
import { fail, json } from "@/lib/server/grooming-http";
import { groomingStore } from "@/lib/server/grooming-store";

export const dynamic = "force-dynamic";

/**
 * GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&main=<serviceId>&extras=a,b
 * Start times customers can request, with live capacity. Always fresh: the
 * calendar must reflect bookings made a second ago.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const dates = dateRange(q.get("from"), q.get("to"));
  const mainId = q.get("main") ?? "";
  const extraIds = (q.get("extras") ?? "").split(",").filter(Boolean).slice(0, 12);
  if (!dates || !mainId) return fail(400, "invalid_request", "Choose a service and a date range.");

  try {
    const store = await groomingStore();
    const [pricing, availability] = await Promise.all([getPricing(store), getAvailability(store)]);
    const slots = slotsNeeded({ mainId, extraIds }, pricing);
    if (!availability.bookingEnabled || slots === null) return json({ ok: true, open: false, days: [] });
    const { days, slotStates } = await availabilityWithStatesFor(store, availability, dates, slots);
    return json({ ok: true, open: true, slotMinutes: availability.slotMinutes, slots, days, slotStates });
  } catch (err) {
    console.error("[grooming/availability]", err);
    return fail(503, "storage_failed", "We couldn't load the calendar. Please try again in a moment.");
  }
}
