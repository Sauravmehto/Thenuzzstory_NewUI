import type { CartLine } from "./types";

/**
 * Combining a saved account list with changes made in the browser while the
 * account was still loading. Quantities take the larger side (not the sum):
 * both sides usually describe the SAME items, so adding would double them.
 */
export function mergeCartMax(saved: readonly CartLine[], local: readonly CartLine[]): CartLine[] {
  const qty = new Map<string, number>();
  for (const line of [...saved, ...local]) qty.set(line.id, Math.max(qty.get(line.id) ?? 0, line.qty));
  return [...qty].map(([id, q]) => ({ id, qty: q }));
}

export const unionIds = (saved: readonly string[], local: readonly string[]): string[] => [...new Set([...saved, ...local])];
