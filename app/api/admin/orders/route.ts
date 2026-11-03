import { NextResponse, type NextRequest } from "next/server";
import { guardAdminApi } from "@/lib/server/admin-auth";
import { orderStore } from "@/lib/server/order-store";

export const dynamic = "force-dynamic";

/** Every saved order, newest first. Read from the order store each time: nothing is cached in the page. */
export async function GET(req: NextRequest) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  try {
    const orders = await (await orderStore()).list();
    return NextResponse.json({ ok: true, orders }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[admin/orders] list failed", err);
    return NextResponse.json({ ok: false, code: "storage_failed", message: "Couldn't load orders from storage." }, { status: 503 });
  }
}
