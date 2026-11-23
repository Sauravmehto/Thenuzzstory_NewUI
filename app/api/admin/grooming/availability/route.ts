import type { NextRequest } from "next/server";
import type { AvailabilityConfig } from "@/lib/grooming/types";
import { guardAdminApi } from "@/lib/server/admin-auth";
import { ConfigError, getAvailability, getPricing, saveAvailability } from "@/lib/server/grooming-config";
import { fail, json, readJsonBody, refreshGroomingPage } from "@/lib/server/grooming-http";
import { groomingStore } from "@/lib/server/grooming-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  try {
    const store = await groomingStore();
    const [availability, pricing] = await Promise.all([getAvailability(store), getPricing(store)]);
    return json({ ok: true, availability, pricing });
  } catch (err) {
    console.error("[admin/grooming/availability] GET", err);
    return fail(503, "storage_failed", "Couldn't load availability.");
  }
}

export async function PUT(req: NextRequest) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const body = (await readJsonBody(req, 100_000)) as { availability?: AvailabilityConfig } | null;
  if (!body?.availability || typeof body.availability !== "object") return fail(400, "invalid_request", "Nothing to save.");
  try {
    const saved = await saveAvailability(body.availability, await groomingStore());
    refreshGroomingPage();
    return json({ ok: true, availability: saved });
  } catch (err) {
    if (err instanceof ConfigError) return fail(422, "invalid_availability", err.message, { problems: err.problems });
    console.error("[admin/grooming/availability] PUT", err);
    return fail(503, "storage_failed", "Couldn't save availability. Nothing was changed.");
  }
}
