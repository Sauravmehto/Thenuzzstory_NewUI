import { NextResponse, type NextRequest } from "next/server";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-types";
import { guardAdminApi } from "@/lib/server/admin-auth";
import { orderStore } from "@/lib/server/order-store";
import { ORDER_ID_RE } from "@/lib/server/orders";

export const dynamic = "force-dynamic";

/** { status?, paymentStatus? }: only these two fields can be changed. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const { id } = await params;
  if (!ORDER_ID_RE.test(id)) return NextResponse.json({ ok: false, code: "not_found", message: "Order not found." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { status?: unknown; paymentStatus?: unknown } | null;
  const { status, paymentStatus } = body ?? {};
  const validStatus = status === undefined || (typeof status === "string" && Object.hasOwn(ORDER_STATUS_LABEL, status));
  const validPayment = paymentStatus === undefined || (typeof paymentStatus === "string" && Object.hasOwn(PAYMENT_STATUS_LABEL, paymentStatus));
  if (!validStatus || !validPayment || (status === undefined && paymentStatus === undefined))
    return NextResponse.json({ ok: false, code: "invalid_request", message: "Choose a valid order or payment status." }, { status: 400 });

  try {
    const store = await orderStore();
    const order = await store.get(id);
    if (!order) return NextResponse.json({ ok: false, code: "not_found", message: "Order not found." }, { status: 404 });
    const updated = {
      ...order,
      ...(status !== undefined && { status: status as typeof order.status }),
      ...(paymentStatus !== undefined && { paymentStatus: paymentStatus as typeof order.paymentStatus }),
      updatedAt: new Date().toISOString(),
    };
    if (!(await store.update(updated))) return NextResponse.json({ ok: false, code: "not_found", message: "Order not found." }, { status: 404 });
    return NextResponse.json({ ok: true, order: updated });
  } catch (err) {
    console.error("[admin/orders] update failed", err);
    return NextResponse.json({ ok: false, code: "storage_failed", message: "Couldn't save the change. Nothing was updated." }, { status: 503 });
  }
}
