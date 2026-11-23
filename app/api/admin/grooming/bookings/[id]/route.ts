import type { NextRequest } from "next/server";
import { guardAdminApi } from "@/lib/server/admin-auth";
import { applyAdminAction, getBooking, rescheduleAvailability, type AdminAction } from "@/lib/server/grooming-bookings";
import { getAvailability, getPricing } from "@/lib/server/grooming-config";
import { dateRange } from "@/lib/server/grooming-dates";
import { fail, json, readJsonBody } from "@/lib/server/grooming-http";
import { groomingStore } from "@/lib/server/grooming-store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** One booking. With ?from=&to= also the free start times for rescheduling it. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    const store = await groomingStore();
    const booking = await getBooking(store, id);
    if (!booking) return fail(404, "not_found", "Booking not found.");
    const [pricing, availability] = await Promise.all([getPricing(store), getAvailability(store)]);
    const dates = dateRange(req.nextUrl.searchParams.get("from"), req.nextUrl.searchParams.get("to"));
    const days = dates ? await rescheduleAvailability(store, availability, booking, dates) : undefined;
    return json({ ok: true, booking, pricing, availability, days });
  } catch (err) {
    console.error("[admin/grooming/bookings/id] GET", err);
    return fail(503, "storage_failed", "Couldn't load the booking. Please try again.");
  }
}

const ACTIONS = new Set(["confirm", "complete", "cancel", "reject", "reschedule", "note", "whatsapp_opened"]);

/** { action, note?, reason?, date?, start?, template? } */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const { id } = await params;
  const body = (await readJsonBody(req, 8_000)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== "string" || !ACTIONS.has(body.action)) return fail(400, "invalid_request", "Choose an action.");
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);
  const act = {
    action: body.action,
    note: str("note"),
    reason: str("reason") ?? "",
    date: str("date") ?? "",
    start: str("start") ?? "",
    template: str("template") ?? "",
  } as AdminAction;
  try {
    const store = await groomingStore();
    const result = await applyAdminAction(store, id, act, await getAvailability(store));
    if (!result.ok) return fail(result.status, result.code, result.message);
    return json({ ok: true, booking: result.booking });
  } catch (err) {
    console.error("[admin/grooming/bookings/id] PATCH", err);
    return fail(503, "storage_failed", "Couldn't save the change. Nothing was updated.");
  }
}
