import type { NextRequest } from "next/server";
import { validateSignIn } from "@/lib/account-types";
import { accountStore } from "@/lib/server/account-store";
import { mergeIntoUser, signedInResponse } from "@/lib/server/account-data";
import {
  accountError,
  clearFailures,
  guardAccountWrite,
  lockedFor,
  recordFailure,
  throttleKey,
  timingDummyHash,
  verifyPassword,
} from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** Sign in: { email, password, guest: { cart, wishlist } }. Guest items are merged into the account. */
export async function POST(req: NextRequest) {
  const denied = guardAccountWrite(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return accountError(400, { code: "invalid_request", message: "Something went wrong. Please try again." });
  const { errors, value } = validateSignIn(body);
  if (Object.keys(errors).length)
    return accountError(422, { code: "validation", message: "Please check the highlighted fields.", errors });

  const key = throttleKey(req, value.email);
  const minutes = lockedFor(key);
  if (minutes)
    return accountError(429, {
      code: "rate_limited",
      message: `Too many attempts. Please wait ${minutes} minute${minutes === 1 ? "" : "s"} and try again.`,
    });

  const store = await accountStore();
  const id = await store.findIdByEmail(value.email);
  const user = id ? await store.get(id) : null;
  // Same work whether or not the email exists, so timing doesn't reveal accounts.
  const ok = await verifyPassword(value.password, user?.passwordHash ?? (await timingDummyHash()));
  if (!user || !ok) {
    recordFailure(key);
    return accountError(401, { code: "wrong_credentials", message: "That email and password don't match. Please try again." });
  }
  clearFailures(key);

  const merged = await store.update(user.id, (u) => mergeIntoUser(u, (body.guest as Record<string, unknown> | undefined) ?? {}));
  return signedInResponse(merged ?? user);
}
