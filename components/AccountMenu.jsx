"use client";

import { useEffect, useRef, useState } from "react";
import { useWishlist } from "@/lib/wishlist";
import { useCart } from "@/lib/cart";
import { useAccount } from "@/lib/account";
import { IconStar, IconCart, IconTruck, IconClose, IconUser } from "@/components/icons";

/** "Priya Sharma" -> "PS", "Priya" -> "P". */
const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const { openWishlist, count: wishlistCount } = useWishlist();
  const { openCart, count: cartCount } = useCart();
  const { status, profile, openPanel, signOut } = useAccount();
  const signedIn = status === "signedIn" && profile;

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      // Arrow keys move between menu items.
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') ?? []);
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement);
      const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items[next].focus();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    // Focus the first item, so the menu works from the keyboard.
    const raf = requestAnimationFrame(() => menuRef.current?.querySelector('[role="menuitem"]')?.focus());
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        className="account-menu__trigger cozy-icon-btn"
        aria-label={signedIn ? `Account: ${profile.name}` : "Account"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-signed-in={signedIn ? "" : undefined}
      >
        {signedIn ? (
          <span className="account-menu__initials" aria-hidden="true">
            {initials(profile.name)}
          </span>
        ) : (
          <IconUser className="account-menu__trigger-icon" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="account-menu__dropdown" role="menu" ref={menuRef} aria-label="Account">
          <div className="account-menu__head">
            <div>
              <span className="account-menu__hi">
                {status === "loading" ? "…" : signedIn ? profile.name : "Guest"}🐾
              </span>
            </div>
          </div>

          <button className="account-menu__item" role="menuitem" onClick={run(openWishlist)}>
            <IconStar className="account-menu__icon" />
            My wishlist
            {wishlistCount > 0 && <span className="account-menu__count">{wishlistCount}</span>}
          </button>

          <button className="account-menu__item" role="menuitem" onClick={run(openCart)}>
            <IconCart className="account-menu__icon" />
            My cart
            {cartCount > 0 && <span className="account-menu__count">{cartCount}</span>}
          </button>

          <button className="account-menu__item" role="menuitem" onClick={run(() => openPanel("orders"))}>
            <IconTruck className="account-menu__icon" />
            Order history
          </button>

          <div className="account-menu__divider" />

          {signedIn ? (
            <button className="account-menu__item account-menu__signout" role="menuitem" onClick={run(() => void signOut())}>
              <IconClose className="account-menu__icon" />
              Sign out
            </button>
          ) : (
            <>
              <button className="account-menu__signin" role="menuitem" onClick={run(() => openPanel("signin"))}>
                Sign in
              </button>
              <button
                className="account-menu__item account-menu__create"
                role="menuitem"
                onClick={run(() => openPanel("signup"))}
              >
                New here? Create an account
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
