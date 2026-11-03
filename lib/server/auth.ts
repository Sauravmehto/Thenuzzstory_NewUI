import "server-only";
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import type { AccountError } from "@/lib/account-types";
import { accountStore, type StoredUser } from "./account-store";
import { dataDir } from "./data-dir";

/**
 * Customer sign-in.
 *
 * - Passwords: scrypt (memory-hard) with a random 16-byte salt per user.
 * - Session: an httpOnly, SameSite=Lax cookie holding userId + expiry +
 *   sessionVersion, signed with HMAC-SHA256 (AUTH_SECRET). Scripts on the page
 *   can't read it, and changing sessionVersion invalidates every old cookie.
 * - Writes must come from this site (Origin check), on top of SameSite.
 */

export const SESSION_COOKIE = "nuzz_session";
const SESSION_DAYS = 30;

// ---- secret ---------------------------------------------------------------------

let devSecret: string | null = null;

/** AUTH_SECRET in production. In development, a random one kept in .data/ (git-ignored). */
function authSecret(): string | null {
  const configured = process.env.AUTH_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") return null;
  if (devSecret) return devSecret;
  const file = path.join(dataDir(), "auth-secret");
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, randomBytes(32).toString("hex"), { flag: "wx" });
  }
  devSecret = readFileSync(file, "utf8").trim();
  return devSecret;
}

export const authAvailable = () => authSecret() !== null;

// ---- passwords ------------------------------------------------------------------

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const scrypt = (password: string, salt: Buffer, keylen: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(password.normalize("NFKC"), salt, keylen, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, N, r, p, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const key = await scrypt(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Hash of a random password: verifying against it makes "no such email" take as long as a wrong password. */
let dummyHash: Promise<string> | null = null;
export const timingDummyHash = () => (dummyHash ??= hashPassword(randomBytes(12).toString("hex")));

// ---- session cookie ---------------------------------------------------------------

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function createSessionToken(user: Pick<StoredUser, "id" | "sessionVersion">, now = Date.now()): string | null {
  const secret = authSecret();
  if (!secret) return null;
  const payload = `${user.id}.${Math.floor(now / 1000) + SESSION_DAYS * 86400}.${user.sessionVersion}`;
  return `${payload}.${sign(payload, secret)}`;
}

function readSessionToken(token: string | undefined, now = Date.now()) {
  const secret = authSecret();
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [id, exp, version, sig] = parts as [string, string, string, string];
  const expected = Buffer.from(sign(`${id}.${exp}.${version}`, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (!/^\d+$/.test(exp) || Number(exp) * 1000 < now) return null;
  if (!/^[a-f0-9]{32}$/.test(id)) return null;
  return { id, version: Number(version) };
}

export const sessionCookie = (value: string, maxAge = SESSION_DAYS * 86400) => ({
  name: SESSION_COOKIE,
  value,
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge,
});

/** The signed-in user for this request, or null. */
export async function sessionUser(req: NextRequest): Promise<StoredUser | null> {
  const session = readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await (await accountStore()).get(session.id);
  return user && user.sessionVersion === session.version ? user : null;
}

// ---- request guards ---------------------------------------------------------------

export const accountError = (status: number, body: Omit<AccountError, "ok">) =>
  NextResponse.json<AccountError>({ ok: false, ...body }, { status });

/** Writes must come from this site (checked on top of SameSite cookies). */
export function requireSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin || origin !== req.nextUrl.origin)
    return accountError(403, { code: "forbidden", message: "This request was blocked for your security. Reload the page and try again." });
  return null;
}

/** Blocks writes from other sites and reports when sign-in isn't configured. */
export function guardAccountWrite(req: NextRequest): NextResponse | null {
  if (!authAvailable())
    return accountError(503, { code: "unavailable", message: "Sign-in isn't available right now. Please try again later." });
  const origin = req.headers.get("origin");
  if (!origin || origin !== req.nextUrl.origin)
    return accountError(403, { code: "forbidden", message: "This request was blocked for your security. Reload the page and try again." });
  return null;
}

// ---- sign-in throttling (per instance; enough to slow down guessing) ----------------

const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 8;
const LOCK_MS = 5 * 60_000;

export const throttleKey = (req: NextRequest, email: string) =>
  `${req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local"}|${email}`;

export function lockedFor(key: string, now = Date.now()) {
  const a = attempts.get(key);
  return a && a.until > now ? Math.ceil((a.until - now) / 60_000) : 0;
}

export function recordFailure(key: string, now = Date.now()) {
  const a = attempts.get(key) ?? { count: 0, until: 0 };
  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) {
    a.count = 0;
    a.until = now + LOCK_MS;
  }
  attempts.set(key, a);
  if (attempts.size > 10_000) attempts.clear(); // bound memory
}

export const clearFailures = (key: string) => attempts.delete(key);
