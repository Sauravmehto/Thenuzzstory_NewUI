"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { getProduct } from "./catalog";
import {
  cartReducer,
  initialCartState,
  selectQty,
  selectVisibleLines,
  type CartAction,
  type CartState,
} from "./cart-state";
import type { CartLine, CartUpdateResponse } from "./types";

const STORAGE_KEY = "cozypaws-cart";

export interface CartNotice {
  id: number;
  message: string;
  tone: "info" | "error";
  /** Optional button in the toast, e.g. Undo after a removal. */
  action?: { label: string; run: () => void };
  /** How long the toast stays up (ms). */
  duration?: number;
}

/** Why a row just changed on its own (shown on the row itself). */
export interface LineNote {
  text: string;
  tone: "info" | "error";
  key: number;
}

interface CartContextValue {
  /** Optimistic lines: what the user should see right now. */
  items: CartLine[];
  count: number;
  hydrated: boolean;
  addItem: (id: string, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  /** Adopt lines the server has already priced (e.g. after a quote change). */
  replaceLines: (lines: CartLine[]) => void;
  isPending: (id: string) => boolean;
  notice: CartNotice | null;
  dismissNotice: () => void;
  /** A short reason on a row the server corrected or rolled back. */
  lineNote: (id: string) => LineNote | undefined;
  /** The line the user just added (drives the drawer highlight). */
  lastAdded: { id: string; seq: number } | null;
  /** The header cart button: where "fly to cart" images land. */
  cartTargetRef: RefObject<HTMLButtonElement | null>;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/** Drops products we no longer sell and clamps to known stock. */
function sanitize(lines: unknown): CartLine[] {
  if (!Array.isArray(lines)) return [];
  const out: CartLine[] = [];
  for (const raw of lines) {
    if (typeof raw !== "object" || raw === null) continue;
    const { id, qty } = raw as Record<string, unknown>;
    if (typeof id !== "string" || typeof qty !== "number") continue;
    const product = getProduct(id);
    if (!product) continue;
    const clamped = Math.min(Math.floor(qty), product.stock);
    if (clamped > 0) out.push({ id, qty: clamped });
  }
  return out;
}

function readStoredCart(): CartLine[] {
  try {
    return sanitize(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>(initialCartState);
  // A synchronous mirror of state, so rapid clicks in the same frame compute
  // the next quantity from the latest value rather than a stale render.
  const stateRef = useRef<CartState>(initialCartState);
  const seqRef = useRef(0);
  const noticeSeq = useRef(0);
  const [hydrated, setHydrated] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState<CartNotice | null>(null);
  const cartTargetRef = useRef<HTMLButtonElement | null>(null);
  const [lastAdded, setLastAdded] = useState<{ id: string; seq: number } | null>(null);
  const [lineNotes, setLineNotes] = useState<Record<string, LineNote>>({});
  const noteTimers = useRef<Record<string, number>>({});

  const dispatch = useCallback((action: CartAction) => {
    stateRef.current = cartReducer(stateRef.current, action);
    setState(stateRef.current);
  }, []);

  const notify = useCallback(
    (message: string, tone: CartNotice["tone"], extra?: Pick<CartNotice, "action" | "duration">) => {
      noticeSeq.current += 1;
      setNotice({ id: noticeSeq.current, message, tone, ...extra });
    },
    [],
  );

  // The toast explains a correction, but people look at the row they
  // touched, so the row carries a short reason too (for a few seconds).
  const noteLine = useCallback((id: string, text: string, tone: LineNote["tone"]) => {
    noticeSeq.current += 1;
    const key = noticeSeq.current;
    setLineNotes((notes) => ({ ...notes, [id]: { text, tone, key } }));
    window.clearTimeout(noteTimers.current[id]);
    noteTimers.current[id] = window.setTimeout(() => {
      setLineNotes(({ [id]: _gone, ...rest }) => rest);
    }, 4000);
  }, []);
  useEffect(() => {
    const timers = noteTimers.current;
    return () => Object.values(timers).forEach((t) => window.clearTimeout(t));
  }, []);

  // Server renders an empty cart; hydrate from storage after mount so the
  // first client render matches the server HTML.
  useEffect(() => {
    dispatch({ type: "hydrate", lines: readStoredCart() });
    setHydrated(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) dispatch({ type: "hydrate", lines: readStoredCart() });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [dispatch]);

  // Persist only what the server confirmed, never in-flight guesses.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.confirmed));
    } catch {
      /* storage full or blocked: the cart still works for this session */
    }
  }, [state.confirmed, hydrated]);

  const updateQty = useCallback(
    async (id: string, rawQty: number, at?: number) => {
      const product = getProduct(id);
      if (!product) return;
      const qty = Math.max(0, Math.min(99, Math.floor(rawQty)));
      const previous = selectQty(stateRef.current, id);
      if (qty === previous) return;
      const removedAt =
        qty === 0 ? selectVisibleLines(stateRef.current).findIndex((l) => l.id === id) : -1;

      seqRef.current += 1;
      const seq = seqRef.current;
      dispatch({ type: "request", id, qty, seq, at }); // optimistic: UI updates now

      // Removing is one tap, so make it one tap to take back.
      if (qty === 0) {
        notify(`Removed ${product.name}.`, "info", {
          duration: 6000,
          action: {
            label: "Undo",
            run: () => {
              void updateQty(id, previous, removedAt >= 0 ? removedAt : undefined);
              // Put keyboard focus back on the restored row, not on <body>.
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  const buttons = document.querySelectorAll<HTMLElement>(
                    `[aria-label="Remove ${product.name}"]`,
                  );
                  Array.from(buttons)
                    .find((el) => !el.closest("[inert]"))
                    ?.focus({ preventScroll: true });
                }),
              );
            },
          },
        });
      }

      try {
        const res = await fetch("/api/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, qty }),
        });
        const data = (await res.json()) as CartUpdateResponse;
        if (data.ok) {
          dispatch({ type: "confirm", id, qty: data.line.qty, seq });
          return;
        }
        if (data.code === "insufficient_stock" || data.code === "unknown_product") {
          const available = data.available ?? 0;
          dispatch({ type: "reject", id, seq, available });
          notify(data.message, "info");
          if (available > 0) noteLine(id, `only ${available} left`, "info");
        } else {
          dispatch({ type: "reject", id, seq });
          notify(data.message, "error");
          explainRollback(id, qty);
        }
      } catch {
        dispatch({ type: "reject", id, seq });
        notify("Network hiccup: your cart wasn't changed. Try again.", "error");
        explainRollback(id, qty);
      }

      function explainRollback(lineId: string, wanted: number) {
        const now = selectQty(stateRef.current, lineId);
        if (now === 0) return; // the row is gone; the toast explains it
        noteLine(lineId, wanted === 0 ? "couldn't remove, try again" : `not saved, back to ${now}`, "error");
      }
    },
    [dispatch, notify, noteLine],
  );

  const addItem = useCallback(
    (id: string, qty = 1) => {
      void updateQty(id, selectQty(stateRef.current, id) + qty);
      setLastAdded((prev) => ({ id, seq: (prev?.seq ?? 0) + 1 }));
    },
    [updateQty],
  );

  const setQty = useCallback(
    (id: string, qty: number) => void updateQty(id, qty),
    [updateQty],
  );
  const removeItem = useCallback((id: string) => void updateQty(id, 0), [updateQty]);
  const clearCart = useCallback(() => dispatch({ type: "clear" }), [dispatch]);
  const replaceLines = useCallback(
    (lines: CartLine[]) => dispatch({ type: "replace", lines }),
    [dispatch],
  );
  const isPending = useCallback((id: string) => id in state.pending, [state.pending]);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const lineNote = useCallback((id: string) => lineNotes[id], [lineNotes]);
  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const items = useMemo(() => selectVisibleLines(state), [state]);
  const count = items.reduce((sum, item) => sum + item.qty, 0);

  const value: CartContextValue = {
    items,
    count,
    hydrated,
    addItem,
    setQty,
    removeItem,
    clearCart,
    replaceLines,
    isPending,
    notice,
    dismissNotice,
    lineNote,
    lastAdded,
    cartTargetRef,
    isOpen,
    openCart,
    closeCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
