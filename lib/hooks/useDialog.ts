import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog behaviour for drawers:
 * - moves focus into the dialog on open and back to the trigger on close
 * - traps Tab / Shift+Tab inside
 * - Esc closes
 * - makes everything else `inert`, so screen readers and the keyboard
 *   can't wander into the page behind it
 */
export function useDialog(
  dialogRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void,
  /** Element to focus on open (e.g. the dialog's heading). Defaults to the first focusable. */
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;

    const siblings = Array.from(document.body.children).filter(
      (el): el is HTMLElement =>
        el instanceof HTMLElement &&
        el !== dialog &&
        !el.contains(dialog) &&
        !el.hasAttribute("inert") &&
        // Live announcements (the cart toast and its Undo) must stay usable
        // while a drawer is open: removing from the drawer is what shows them.
        !el.hasAttribute("data-dialog-exempt"),
    );
    siblings.forEach((el) => el.setAttribute("inert", ""));

    const focusables = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
    // Wait a frame so the element is visible (it animates in from off-screen).
    const raf = requestAnimationFrame(() =>
      (initialFocusRef?.current ?? focusables()[0] ?? dialog).focus(),
    );

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      siblings.forEach((el) => el.removeAttribute("inert"));
      returnFocusRef.current?.focus?.();
    };
  }, [dialogRef, isOpen]);
}
