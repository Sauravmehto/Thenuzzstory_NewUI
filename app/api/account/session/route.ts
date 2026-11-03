import { NextResponse, type NextRequest } from "next/server";
import type { AccountSession } from "@/lib/account-types";
import { sessionBody } from "@/lib/server/account-data";
import { authAvailable, guardAccountWrite, sessionCookie, sessionUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** Who is signed in (with their saved cart and wishlist). Signed out is not an error. */
export async function GET(req: NextRequest) {
  const user = authAvailable() ? await sessionUser(req) : null;
  const body: AccountSession = user ? sessionBody(user) : { signedIn: false, available: authAvailable() };
  return NextResponse.json({ ok: true, session: body }, { headers: { "Cache-Control": "no-store" } });
}

/** Sign out: clears the session cookie. */
export async function DELETE(req: NextRequest) {
  const denied = guardAccountWrite(req);
  if (denied) return denied;
  const res = NextResponse.json({ ok: true, session: { signedIn: false, available: true } satisfies AccountSession });
  res.cookies.set(sessionCookie("", 0));
  return res;
}
