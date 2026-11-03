import type { CheckoutCustomer } from "./types";

export type CustomerField = keyof CheckoutCustomer;
export type CustomerErrors = Partial<Record<CustomerField, string>>;

/** States and union territories, as shown in the checkout form. */
export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;

/**
 * "+91 98765-43210", "098765 43210", "9876543210" → "9876543210".
 * Returns null when it isn't a valid Indian mobile number (10 digits, starting 6–9).
 */
export function normalizePhone(value: string): string | null {
  let digits = value.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(digits)) return null;
  digits = digits.replace(/^\+/, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export const normalizePin = (value: string) => value.replace(/\s/g, "");
const isPin = (value: string) => /^[1-9]\d{5}$/.test(normalizePin(value));

/**
 * One set of rules for both sides. The client runs them for instant feedback
 * (no round trip to find a typo); the server runs the same rules because the
 * client can't be trusted. Every field is required.
 */
const RULES: Record<CustomerField, (value: string) => string | undefined> = {
  name: (v) => {
    const t = v.trim().replace(/\s+/g, " ");
    if (!t) return "Enter your full name.";
    if (t.length < 2) return "Enter your full name.";
    if (t.length > 80) return "Keep your name under 80 characters.";
    return undefined;
  },
  phone: (v) =>
    !v.trim()
      ? "Enter your mobile number."
      : normalizePhone(v)
        ? undefined
        : "Enter a valid 10-digit Indian mobile number, like 98765 43210.",
  email: (v) => (!v.trim() ? "Enter your email address." : isEmail(v.trim()) ? undefined : "Enter a valid email, like name@example.com."),
  address: (v) => {
    const t = v.trim();
    if (!t) return "Enter your complete delivery address.";
    if (t.length < 10) return "Enter your complete address: house/flat, street and area.";
    if (t.length > 300) return "Keep the address under 300 characters.";
    return undefined;
  },
  city: (v) => {
    const t = v.trim();
    if (!t) return "Enter your city.";
    return t.length < 2 || t.length > 60 ? "Enter your city." : undefined;
  },
  state: (v) => (!v.trim() ? "Choose your state." : (INDIAN_STATES as readonly string[]).includes(v.trim()) ? undefined : "Choose your state from the list."),
  pin: (v) => (!v.trim() ? "Enter your PIN code." : isPin(v) ? undefined : "Enter a valid 6-digit PIN code, like 110070."),
};

export const CUSTOMER_FIELDS = Object.keys(RULES) as CustomerField[];

export const validateField = (field: CustomerField, value: string) => RULES[field](value);

export function validateCustomer(customer: CheckoutCustomer): CustomerErrors {
  const errors: CustomerErrors = {};
  for (const field of CUSTOMER_FIELDS) {
    const message = validateField(field, customer[field] ?? "");
    if (message) errors[field] = message;
  }
  return errors;
}

/** The customer as it is saved: trimmed, whitespace collapsed, phone as 10 digits, PIN without spaces. */
export function cleanCustomer(customer: CheckoutCustomer): CheckoutCustomer {
  return {
    name: customer.name.trim().replace(/\s+/g, " "),
    phone: normalizePhone(customer.phone) ?? customer.phone.trim(),
    email: customer.email.trim().toLowerCase(),
    address: customer.address.trim().replace(/[ \t]+/g, " "),
    city: customer.city.trim().replace(/\s+/g, " "),
    state: customer.state.trim(),
    pin: normalizePin(customer.pin),
  };
}
