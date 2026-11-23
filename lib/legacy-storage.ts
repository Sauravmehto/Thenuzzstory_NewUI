/**
 * Browser-storage keys were renamed when the store was rebranded
 * (cozypaws-* → nuzz-*). Shoppers who already have a cart or wishlist saved
 * under the old key keep it: the first read falls back to the old key, and
 * the next save writes the new key and drops the old one.
 */
export const CART_KEY = "nuzz-cart";
export const LEGACY_CART_KEY = "cozypaws-cart";
export const WISHLIST_KEY = "nuzz-wishlist";
export const LEGACY_WISHLIST_KEY = "cozypaws-wishlist";

/** Raw stored text: the current key, else the legacy one. Null when neither exists or storage is blocked. */
export function readStoredWithLegacy(key: string, legacyKey: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? window.localStorage.getItem(legacyKey);
  } catch {
    return null;
  }
}

/** Saves under the current key and removes the legacy copy. */
export function writeStoredAndDropLegacy(key: string, legacyKey: string, value: string): void {
  window.localStorage.setItem(key, value);
  window.localStorage.removeItem(legacyKey);
}
