import type { Cents } from "./types";

/**
 * Store money settings: currency and shipping live together on purpose,
 * because amounts are stored as integer minor units (paise / cents) and the
 * shipping numbers only make sense in the currency they were written for.
 */
export type StoreCurrency = "USD" | "INR";

export interface StoreMoney {
  currency: StoreCurrency;
  /** Flat delivery fee below the free-delivery threshold. */
  shippingCents: Cents;
  freeShippingThresholdCents: Cents;
}

/** The live store: rupees. ₹79 delivery below ₹499, free from ₹499. */
export const LIVE_MONEY: StoreMoney = {
  currency: "INR",
  shippingCents: 7900,
  freeShippingThresholdCents: 49900,
};

/**
 * The original demo store ($4.99 shipping, free over $50). Only used by the
 * e2e suite and the pricing unit tests, which run against the frozen demo
 * products (tests/fixtures/catalog.public.e2e.json) priced in US cents.
 * Selected with NEXT_PUBLIC_STORE_PROFILE=demo-usd (set by `npm run build:e2e`).
 */
export const DEMO_USD_MONEY: StoreMoney = {
  currency: "USD",
  shippingCents: 499,
  freeShippingThresholdCents: 5000,
};

export const STORE_MONEY: StoreMoney =
  process.env.NEXT_PUBLIC_STORE_PROFILE === "demo-usd" ? DEMO_USD_MONEY : LIVE_MONEY;

/** Locale used to format each supported currency. */
export const CURRENCY_LOCALE: Record<StoreCurrency, string> = {
  USD: "en-US",
  INR: "en-IN",
};
