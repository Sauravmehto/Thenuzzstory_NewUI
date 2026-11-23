import type { NextRequest } from "next/server";
import type { PricingConfig } from "@/lib/grooming/types";
import { guardAdminApi } from "@/lib/server/admin-auth";
import { ConfigError, getPricing, menuPricing, savePricing } from "@/lib/server/grooming-config";
import { fail, json, readJsonBody, refreshGroomingPage } from "@/lib/server/grooming-http";
import { groomingStore } from "@/lib/server/grooming-store";

export const dynamic = "force-dynamic";

/** Live pricing, plus the printed menu (for "differs from menu" and reset). */
export async function GET(req: NextRequest) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  try {
    return json({ ok: true, pricing: await getPricing(await groomingStore()), menu: menuPricing() });
  } catch (err) {
    console.error("[admin/grooming/pricing] GET", err);
    return fail(503, "storage_failed", "Couldn't load prices.");
  }
}

export async function PUT(req: NextRequest) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const body = (await readJsonBody(req, 200_000)) as { pricing?: PricingConfig } | null;
  if (!body?.pricing || typeof body.pricing !== "object") return fail(400, "invalid_request", "Nothing to save.");
  try {
    const saved = await savePricing(body.pricing, await groomingStore());
    refreshGroomingPage();
    return json({ ok: true, pricing: saved });
  } catch (err) {
    if (err instanceof ConfigError) return fail(422, "invalid_pricing", err.message, { problems: err.problems });
    console.error("[admin/grooming/pricing] PUT", err);
    return fail(503, "storage_failed", "Couldn't save prices. Nothing was changed.");
  }
}
