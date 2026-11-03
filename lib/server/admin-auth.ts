import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Admin access for the local product admin.
 *
 * - Enabled only when ADMIN_PASSWORD is set (in .env.local, never committed).
 * - Off in production builds unless ADMIN_ENABLE_IN_PRODUCTION=1, because the
 *   admin saves to files on this machine (hosted file systems don't keep them).
 * - Session = signed, httpOnly, SameSite=Strict cookie (HMAC-SHA256). Changing
 *   the password invalidates every session.
 * - Every admin API route checks the session on the server, plus a same-origin
 *   check on writes. Hiding links in the UI is never the protection.
 */

export const ADMIN_COOKIE = "nuzz_admin";
const SESSION_SECONDS = 8 * 60 * 60;
const MIN_PASSWORD_LENGTH = 8;

export type AdminAvailability = { enabled: true } | { enabled: false; reason: string };

export function adminAvailability(): AdminAvailability {
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (password.length < MIN_PASSWORD_LENGTH)
    return {
      enabled: false,
      reason: `The admin is off. Set ADMIN_PASSWORD (at least ${MIN_PASSWORD_LENGTH} characters) in .env.local and restart the dev server.`,
    };
  if (process.env.NODE_ENV === "production" && process.env.ADMIN_ENABLE_IN_PRODUCTION !== "1")
    return { enabled: false, reason: "The admin is only available when running locally." };
  return { enabled: true };
}

const sha256 = (value: string) => createHash("sha256").update(value).digest();

function signingKey(): Buffer {
  const explicit = process.env.ADMIN_SESSION_SECRET;
  return explicit && explicit.length >= 16 ? sha256(`nuzz-admin-secret:${explicit}`) : sha256(`nuzz-admin:${process.env.ADMIN_PASSWORD ?? ""}`);
}

const sign = (payload: string) => createHmac("sha256", signingKey()).update(payload).digest("base64url");

/** Constant-time password check. */
export function checkPassword(input: unknown): boolean {
  if (typeof input !== "string" || adminAvailability().enabled === false) return false;
  return timingSafeEqual(sha256(input), sha256(process.env.ADMIN_PASSWORD ?? ""));
}

export function createSessionToken(now = Date.now()): string {
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(12).toString("base64url")}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token || adminAvailability().enabled === false) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [exp, nonce, sig] = parts as [string, string, string];
  if (!/^\d+$/.test(exp) || Number(exp) * 1000 < now) return false;
  const expected = Buffer.from(sign(`${exp}.${nonce}`));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const sessionCookie = (token: string) => ({
  name: ADMIN_COOKIE,
  value: token,
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_SECONDS,
});

// ---- login throttling (per IP, in memory: fine for a local admin) ---------

const failures = new Map<string, { count: number; lockedUntil: number }>();
const MAX_FAILURES = 5;
const LOCK_MS = 60_000;

export const clientKey = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";

export function loginLockedFor(key: string, now = Date.now()): number {
  const entry = failures.get(key);
  return entry && entry.lockedUntil > now ? Math.ceil((entry.lockedUntil - now) / 1000) : 0;
}

export function recordLoginFailure(key: string, now = Date.now()) {
  const entry = failures.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) {
    entry.count = 0;
    entry.lockedUntil = now + LOCK_MS;
  }
  failures.set(key, entry);
}

export const clearLoginFailures = (key: string) => failures.delete(key);

// ---- guards -----------------------------------------------------------------

/**
 * For admin API routes. Returns a response to send back when the request is
 * not allowed, or null when it is. Usage: `const denied = guardAdminApi(req); if (denied) return denied;`
 */
export function guardAdminApi(req: NextRequest): NextResponse | null {
  const availability = adminAvailability();
  if (!availability.enabled)
    return NextResponse.json({ ok: false, code: "admin_disabled", message: availability.reason }, { status: 404 });

  if (req.method !== "GET" && req.method !== "HEAD") {
    // Writes must come from our own pages (the cookie is SameSite=Strict too).
    const origin = req.headers.get("origin");
    if (!origin || origin !== req.nextUrl.origin)
      return NextResponse.json({ ok: false, code: "forbidden", message: "Cross-site request blocked." }, { status: 403 });
  }

  if (!verifySessionToken(req.cookies.get(ADMIN_COOKIE)?.value))
    return NextResponse.json({ ok: false, code: "unauthorized", message: "Please log in to the admin again." }, { status: 401 });
  return null;
}

/**
 * For admin pages (server components). Signed out -> login. Admin switched off ->
 * in development, the login page explains how to turn it on; in production, 404.
 */
export async function requireAdminPage(nextPath: string): Promise<void> {
  if (!adminAvailability().enabled) {
    if (process.env.NODE_ENV === "production") notFound();
    redirect("/admin/login");
  }
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!verifySessionToken(token)) redirect(`/admin/login?next=${encodeURIComponent(nextPath)}`);
}
