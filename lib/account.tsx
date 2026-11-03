"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { mergeCartMax, unionIds } from "./account-merge";
import type { AccountError, AccountOrder, AccountProfile, AccountSession } from "./account-types";
import { useCart } from "./cart";
import type { CartLine } from "./types";
import { useWishlist } from "./wishlist";

/**
 * The signed-in customer, kept in sync with the server.
 *
 * Sign-in state lives in an httpOnly cookie the page can't read; this provider
 * asks /api/account/session on load. While signed in, the cart and wishlist
 * are saved to the account (debounced), so they follow the customer to other
 * devices. Signing in merges what they collected as a guest.
 */

export type AccountPanel = null | "signin" | "signup" | "orders";
export type AuthResult = { ok: true } | { ok: false; error: AccountError };

interface AccountContextValue {
  status: "loading" | "guest" | "signedIn";
  profile: AccountProfile | null;
  /** False when the server has sign-in switched off (e.g. AUTH_SECRET missing). */
  available: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (name: string, email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  loadOrders: () => Promise<{ ok: true; orders: AccountOrder[] } | { ok: false; error: AccountError }>;
  panel: AccountPanel;
  openPanel: (panel: Exclude<AccountPanel, null>) => void;
  closePanel: () => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);
const SYNC_DELAY_MS = 600;

const networkError: AccountError = {
  ok: false,
  code: "unavailable",
  message: "Couldn't reach the store. Check your connection and try again.",
};

async function call<T>(url: string, init?: RequestInit): Promise<({ ok: true } & T) | AccountError> {
  try {
    const res = await fetch(url, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    });
    const data = (await res.json().catch(() => null)) as (({ ok: true } & T) | AccountError) | null;
    if (!data) return { ...networkError, message: `Something went wrong (error ${res.status}). Please try again.` };
    return data;
  } catch {
    return networkError;
  }
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccountContextValue["status"]>("loading");
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [available, setAvailable] = useState(true);
  const [panel, setPanel] = useState<AccountPanel>(null);

  const { items, replaceLines, clearCart, hydrated } = useCart();
  const { ids: wishlistIds, replace: replaceWishlist } = useWishlist();

  // What the server last confirmed: changes that match it aren't sent again.
  const synced = useRef<{ cart: string; wishlist: string } | null>(null);

  // The latest cart and wishlist, readable from async code without stale values.
  const latest = useRef({ cart: items, wishlist: wishlistIds });
  latest.current = { cart: items, wishlist: wishlistIds };

  const apply = useCallback(
    (session: AccountSession, show?: { cart: CartLine[]; wishlist: string[] }) => {
      if (!session.signedIn) {
        synced.current = null;
        setProfile(null);
        setAvailable(session.available);
        setStatus("guest");
        return;
      }
      // What the server holds. When `show` differs (changes made while loading), the
      // difference is saved to the server by the sync effect below.
      synced.current = { cart: JSON.stringify(session.cart), wishlist: JSON.stringify(session.wishlist) };
      replaceLines(show?.cart ?? session.cart);
      replaceWishlist(show?.wishlist ?? session.wishlist);
      setProfile(session.profile);
      setAvailable(true);
      setStatus("signedIn");
    },
    [replaceLines, replaceWishlist],
  );

  // Restore the session once the guest cart has been read from storage.
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const before = JSON.stringify(latest.current);
    void call<{ session: AccountSession }>("/api/account/session").then((res) => {
      if (cancelled) return;
      if (!res.ok) return setStatus("guest");
      const { session } = res;
      // Did the customer add or save something while we were asking? Then keep it:
      // replacing their cart with the saved one would silently delete what they just did.
      if (session.signedIn && JSON.stringify(latest.current) !== before) {
        apply(session, {
          cart: mergeCartMax(session.cart, latest.current.cart),
          wishlist: unionIds(session.wishlist, latest.current.wishlist),
        });
      } else apply(session);
    });
    return () => {
      cancelled = true;
    };
    // Only on first load: later changes go through sign in / sign out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Save cart + wishlist changes while signed in.
  const cartJson = JSON.stringify(items);
  const wishlistJson = JSON.stringify(wishlistIds);
  useEffect(() => {
    if (status !== "signedIn" || !synced.current) return;
    const timer = window.setTimeout(async () => {
      const last = synced.current;
      if (!last) return;
      const writes: Promise<unknown>[] = [];
      if (cartJson !== last.cart) {
        last.cart = cartJson;
        writes.push(call("/api/account/cart", { method: "PUT", body: JSON.stringify({ lines: JSON.parse(cartJson) }) }));
      }
      if (wishlistJson !== last.wishlist) {
        last.wishlist = wishlistJson;
        writes.push(call("/api/account/wishlist", { method: "PUT", body: JSON.stringify({ ids: JSON.parse(wishlistJson) }) }));
      }
      const results = (await Promise.all(writes)) as ({ ok: boolean; code?: string })[];
      // Session ended elsewhere (signed out on another tab, expired): fall back to guest.
      if (results.some((r) => !r.ok && r.code === "unauthorized")) {
        synced.current = null;
        setProfile(null);
        setStatus("guest");
      }
    }, SYNC_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [status, cartJson, wishlistJson]);

  const guestItems = () => ({ cart: items, wishlist: wishlistIds });

  const signIn = useCallback<AccountContextValue["signIn"]>(
    async (email, password) => {
      const res = await call<{ session: AccountSession }>("/api/account/login", {
        method: "POST",
        body: JSON.stringify({ email, password, guest: guestItems() }),
      });
      if (!res.ok) return { ok: false, error: res };
      apply(res.session);
      return { ok: true };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apply, cartJson, wishlistJson],
  );

  const signUp = useCallback<AccountContextValue["signUp"]>(
    async (name, email, password) => {
      const res = await call<{ session: AccountSession }>("/api/account/signup", {
        method: "POST",
        body: JSON.stringify({ name, email, password, guest: guestItems() }),
      });
      if (!res.ok) return { ok: false, error: res };
      apply(res.session);
      return { ok: true };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apply, cartJson, wishlistJson],
  );

  const signOut = useCallback(async () => {
    await call("/api/account/session", { method: "DELETE" });
    // Their items stay in their account, not on this (possibly shared) device.
    synced.current = null;
    clearCart();
    replaceWishlist([]);
    setProfile(null);
    setStatus("guest");
  }, [clearCart, replaceWishlist]);

  const loadOrders = useCallback(async () => {
    const res = await call<{ orders: AccountOrder[] }>("/api/account/orders");
    return res.ok ? { ok: true as const, orders: res.orders } : { ok: false as const, error: res };
  }, []);

  const openPanel = useCallback((p: Exclude<AccountPanel, null>) => setPanel(p), []);
  const closePanel = useCallback(() => setPanel(null), []);

  const value = useMemo<AccountContextValue>(
    () => ({ status, profile, available, signIn, signUp, signOut, loadOrders, panel, openPanel, closePanel }),
    [status, profile, available, signIn, signUp, signOut, loadOrders, panel, openPanel, closePanel],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used within an AccountProvider");
  return ctx;
}
