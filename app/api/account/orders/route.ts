import { NextResponse, type NextRequest } from "next/server";
import { accountError, authAvailable, sessionUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** The signed-in customer's orders, newest first. */
export async function GET(req: NextRequest) {
  const user = authAvailable() ? await sessionUser(req) : null;
  if (!user) return accountError(401, { code: "unauthorized", message: "Sign in to see your orders." });
  return NextResponse.json({ ok: true, orders: user.orders }, { headers: { "Cache-Control": "no-store" } });
}
