import { NextResponse, type NextRequest } from "next/server";
import {
  adminAvailability,
  checkPassword,
  clearLoginFailures,
  clientKey,
  createSessionToken,
  loginLockedFor,
  recordLoginFailure,
  sessionCookie,
} from "@/lib/server/admin-auth";

/** Log in: { password } -> sets the signed session cookie. */
export async function POST(req: NextRequest) {
  const availability = adminAvailability();
  if (!availability.enabled)
    return NextResponse.json({ ok: false, code: "admin_disabled", message: availability.reason }, { status: 404 });
  const origin = req.headers.get("origin");
  if (!origin || origin !== req.nextUrl.origin)
    return NextResponse.json({ ok: false, code: "forbidden", message: "Cross-site request blocked." }, { status: 403 });

  const key = clientKey(req);
  const locked = loginLockedFor(key);
  if (locked)
    return NextResponse.json(
      { ok: false, code: "locked", message: `Too many attempts. Try again in ${locked} seconds.` },
      { status: 429, headers: { "Retry-After": String(locked) } },
    );

  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  if (!checkPassword(body?.password)) {
    recordLoginFailure(key);
    return NextResponse.json({ ok: false, code: "wrong_password", message: "That password isn't right." }, { status: 401 });
  }
  clearLoginFailures(key);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(sessionCookie(createSessionToken()));
  return res;
}

/** Log out. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ ...sessionCookie(""), maxAge: 0 });
  return res;
}
