"use client";

import { useEffect, useRef, useState } from "react";
import { useCart, type CartNotice } from "@/lib/cart";

const EXIT_MS = 220;

/**
 * Announces cart changes (removals with Undo, stock limits, network failures).
 * Always mounted so the live region exists before the message arrives;
 * screen readers only announce changes to regions already in the DOM.
 *
 * The toast animates out instead of vanishing, pauses its timer while hovered
 * or focused (so nobody loses the Undo while reaching for it), and takes
 * focus when a removal would otherwise drop it on <body>.
 */
export default function CartToast() {
  const { notice, dismissNotice } = useCart();

  // Keep the last notice rendered while it plays its exit animation.
  const [shown, setShown] = useState<CartNotice | null>(notice);
  const [leaving, setLeaving] = useState(false);
  if (notice && notice !== shown) {
    setShown(notice);
    setLeaving(false);
  } else if (!notice && shown && !leaving) {
    setLeaving(true);
  }
  // If focus was inside the toast when it closes, don't drop it on <body>:
  // hand it back to the open drawer, if there is one.
  const regionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!leaving || !regionRef.current?.contains(document.activeElement)) return;
    const openDialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]:not([inert])');
    openDialog?.focus();
  }, [leaving]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => {
      setShown(null);
      setLeaving(false);
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  // Auto-dismiss, paused while the pointer or focus is on the toast.
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!notice || paused) return;
    const timer = window.setTimeout(dismissNotice, notice.duration ?? 5000);
    return () => window.clearTimeout(timer);
  }, [notice, paused, dismissNotice]);

  // The remove button disappears with its row, which would drop keyboard
  // focus on <body>. Catch it on Undo instead.
  const actionRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!notice?.action) return;
    const active = document.activeElement;
    if (!active || active === document.body || active.closest("[inert]")) {
      actionRef.current?.focus({ preventScroll: true });
    }
  }, [notice]);

  return (
    <div
      ref={regionRef}
      className="cart-toast-region"
      data-dialog-exempt=""
      role="status"
      aria-live="polite"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      {shown && (
        <div
          key={shown.id}
          className={`cart-toast cart-toast--${shown.tone}`}
          data-leaving={leaving || undefined}
        >
          <p>{shown.message}</p>
          {shown.action && (
            <button
              ref={actionRef}
              type="button"
              className="cart-toast__action"
              onClick={() => {
                shown.action?.run();
                dismissNotice();
              }}
            >
              {shown.action.label}
            </button>
          )}
          <button
            type="button"
            className="cart-toast__close"
            onClick={dismissNotice}
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
