import { NextResponse, type NextRequest } from "next/server";
import { accountStore } from "@/lib/server/account-store";
import { cleanWishlist } from "@/lib/server/account-data";
import { accountError, guardAccountWrite, sessionUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** Save the signed-in customer's wishlist: { ids: string[] }. Returns what was kept. */
export async function PUT(req: NextRequest) {
  const denied = guardAccountWrite(req);
  if (denied) return denied;
  const user = await sessionUser(req);
  if (!user) return accountError(401, { code: "unauthorized", message: "Please sign in again." });

  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = cleanWishlist(body?.ids);
  await (await accountStore()).update(user.id, (u) => ({ ...u, wishlist: ids, updatedAt: new Date().toISOString() }));
  return NextResponse.json({ ok: true, wishlist: ids });
}
