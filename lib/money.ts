import type { Cents } from "./types";

/*
 * Why integer cents? Floats can't represent most decimal prices exactly
 * (0.1 + 0.2 !== 0.3), so summing $9.99 lines drifts. Integers don't.
 * We only convert to a display string at the very edge of the UI.
 */
const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export const formatPrice = (cents: Cents): string => formatter.format(cents / 100);

export const toCents = (dollars: number): Cents => Math.round(dollars * 100);
