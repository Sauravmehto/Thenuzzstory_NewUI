import type { CartLine, Cents, OrderStatus, PaymentMethod, PaymentStatus } from "./types";

/** What the browser is allowed to know about the signed-in customer. */
export interface AccountProfile {
  name: string;
  email: string;
}

/** A past order, as recorded by /api/checkout when the customer was signed in. */
export interface AccountOrder {
  orderId: string;
  placedAt: string;
  lines: { id: string; name: string; qty: number; unitCents: Cents; lineCents: Cents }[];
  subtotalCents: Cents;
  shippingCents: Cents;
  totalCents: Cents;
  payment: PaymentMethod | "card" | "wallet";
  city: string;
  /** Orders placed before WhatsApp checkout have no status. */
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
}

/** GET /api/account/session and the sign-in / sign-up responses. */
export type AccountSession =
  | { signedIn: false; available: boolean }
  | { signedIn: true; profile: AccountProfile; cart: CartLine[]; wishlist: string[] };

export type AccountErrorCode =
  | "validation"
  | "email_taken"
  | "wrong_credentials"
  | "rate_limited"
  | "unavailable"
  | "unauthorized"
  | "forbidden"
  | "invalid_request";

export interface AccountError {
  ok: false;
  code: AccountErrorCode;
  message: string;
  errors?: Partial<Record<"name" | "email" | "password", string>>;
}

// ---- validation (the same rules run in the form and on the server) ---------

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const NAME_MAX = 80;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function validateSignUp(input: { name?: unknown; email?: unknown; password?: unknown }) {
  const errors: NonNullable<AccountError["errors"]> = {};
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  const email = typeof input.email === "string" ? normalizeEmail(input.email) : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (name.length < 2) errors.name = "Enter your full name.";
  else if (name.length > NAME_MAX) errors.name = `Keep your name under ${NAME_MAX} characters.`;
  if (!EMAIL_RE.test(email) || email.length > 254) errors.email = "Enter a valid email address, like name@example.com.";
  if (password.length < PASSWORD_MIN) errors.password = `Use at least ${PASSWORD_MIN} characters.`;
  else if (password.length > PASSWORD_MAX) errors.password = `Use at most ${PASSWORD_MAX} characters.`;
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = "Use at least one letter and one number.";
  return { errors, value: { name, email, password } };
}

export function validateSignIn(input: { email?: unknown; password?: unknown }) {
  const errors: NonNullable<AccountError["errors"]> = {};
  const email = typeof input.email === "string" ? normalizeEmail(input.email) : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!EMAIL_RE.test(email)) errors.email = "Enter the email address you signed up with.";
  if (!password) errors.password = "Enter your password.";
  else if (password.length > PASSWORD_MAX) errors.password = "That password is too long.";
  return { errors, value: { email, password } };
}
