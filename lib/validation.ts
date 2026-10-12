import type { CheckoutCustomer } from "./types";

export type CustomerField = keyof CheckoutCustomer;
export type CustomerErrors = Partial<Record<CustomerField, string>>;

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * One set of rules for both sides. The client runs them for instant feedback
 * (no round trip to find a typo); the server runs the same rules because the
 * client can't be trusted.
 */
const RULES: Record<CustomerField, (value: string) => string | undefined> = {
  name: (v) => (v.trim().length < 2 ? "Please enter your name." : undefined),
  email: (v) => (!isEmail(v.trim()) ? "Enter a valid email." : undefined),
  address: (v) => (v.trim().length < 5 ? "Enter a delivery address." : undefined),
  city: (v) => (v.trim().length < 2 ? "Enter your city." : undefined),
  zip: (v) => (v.trim().length < 3 ? "Enter a postal code." : undefined),
};

export const CUSTOMER_FIELDS = Object.keys(RULES) as CustomerField[];

export const validateField = (field: CustomerField, value: string) => RULES[field](value);

export function validateCustomer(customer: CheckoutCustomer): CustomerErrors {
  const errors: CustomerErrors = {};
  for (const field of CUSTOMER_FIELDS) {
    const message = validateField(field, customer[field]);
    if (message) errors[field] = message;
  }
  return errors;
}
