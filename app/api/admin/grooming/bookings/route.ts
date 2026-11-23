import type { NextRequest } from "next/server";
import { guardAdminApi } from "@/lib/server/admin-auth";
import { listBookings } from "@/lib/server/grooming-bookings";
import { getAvailability, getPricing } from "@/lib/server/grooming-config";
import { fail, json } from "@/lib/server/grooming-http";
import { groomingStore } from "@/lib/server/grooming-store";

export const dynamic = "force-dynamic";

/** Every grooming booking, newest first, plus the config the list needs to show names and capacity. */
export async function GET(req: NextRequest) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  try {
    const store = await groomingStore();
    const [bookings, pricing, availability] = await Promise.all([listBookings(store), getPricing(store), getAvailability(store)]);
    return json({ ok: true, bookings, pricing, availability });
  } catch (err) {
    console.error("[admin/grooming/bookings]", err);
    return fail(503, "storage_failed", "Couldn't load bookings. Please try again.");
  }
}
