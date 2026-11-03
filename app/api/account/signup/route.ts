import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { validateSignUp } from "@/lib/account-types";
import { accountStore, type StoredUser } from "@/lib/server/account-store";
import { mergeIntoUser, signedInResponse } from "@/lib/server/account-data";
import { accountError, guardAccountWrite, hashPassword } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

/** Create an account: { name, email, password, guest: { cart, wishlist } }. Signs in on success. */
export async function POST(req: NextRequest) {
  const denied = guardAccountWrite(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return accountError(400, { code: "invalid_request", message: "Something went wrong. Please try again." });
  const { errors, value } = validateSignUp(body);
  if (Object.keys(errors).length)
    return accountError(422, { code: "validation", message: "Please check the highlighted fields.", errors });

  const store = await accountStore();
  if (await store.findIdByEmail(value.email))
    return accountError(409, {
      code: "email_taken",
      message: "There's already an account with this email. Sign in instead.",
      errors: { email: "This email already has an account." },
    });

  const now = new Date().toISOString();
  const user: StoredUser = mergeIntoUser(
    {
      id: randomBytes(16).toString("hex"),
      email: value.email,
      name: value.name,
      passwordHash: await hashPassword(value.password),
      sessionVersion: 1,
      createdAt: now,
      updatedAt: now,
      cart: [],
      wishlist: [],
      orders: [],
    },
    (body.guest as Record<string, unknown> | undefined) ?? {},
  );

  // The email is claimed atomically: a sign-up racing this one gets "taken".
  if (!(await store.create(user)))
    return accountError(409, {
      code: "email_taken",
      message: "There's already an account with this email. Sign in instead.",
      errors: { email: "This email already has an account." },
    });

  return signedInResponse(user, 201);
}
