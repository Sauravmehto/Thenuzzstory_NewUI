import { CURRENCY_LOCALE, STORE_MONEY, type StoreCurrency } from "./store-config";
import type { Cents } from "./types";

/*
 * Why integer cents? Floats can't represent most decimal prices exactly
 * (0.1 + 0.2 !== 0.3), so summing $9.99 lines drifts. Integers don't.
 * We only convert to a display string at the very edge of the UI.
 */
export const createPriceFormatter = (currency: StoreCurrency) => {
  const formatter = new Intl.NumberFormat(CURRENCY_LOCALE[currency], { style: "currency", currency });
  // Rupee prices are usually whole: "₹310", not "₹310.00" (paise still show: "₹4.43").
  const whole = new Intl.NumberFormat(CURRENCY_LOCALE[currency], { style: "currency", currency, maximumFractionDigits: 0 });
  return (cents: Cents): string =>
    currency === "INR" && cents % 100 === 0 ? whole.format(cents / 100) : formatter.format(cents / 100);
};

/** Formats in the store currency (lib/store-config.ts). */
export const formatPrice = createPriceFormatter(STORE_MONEY.currency);

export const toCents = (dollars: number): Cents => Math.round(dollars * 100);
