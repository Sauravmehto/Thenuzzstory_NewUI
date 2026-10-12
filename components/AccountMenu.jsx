"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWishlist } from "@/lib/wishlist";
import { useCart } from "@/lib/cart";
import { IconStar, IconCart, IconTruck, IconClose } from "@/components/icons";
import { REMOTE_ASSETS } from "@/lib/remote-assets";

const AVATAR_SRC = REMOTE_ASSETS.avatar;

const STORAGE_KEY = "cozypaws-account";

export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(null); // null = signed out (mock)
  const rootRef = useRef(null);
  const { openWishlist, count: wishlistCount } = useWishlist();
  const { openCart, count: cartCount } = useCart();

  useEffect(() => {
    setName(window.localStorage.getItem(STORAGE_KEY) || null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target))
        setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const signIn = () => {
    const mockName = "Buddy's human";
    window.localStorage.setItem(STORAGE_KEY, mockName);
    setName(mockName);
  };

  const signOut = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setName(null);
  };

  const run = (fn) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        className="account-menu__trigger"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <img src={AVATAR_SRC} alt="" />
      </button>

      {open && (
        <div className="account-menu__dropdown" role="menu">
          <div className="account-menu__head">
            <img src={AVATAR_SRC} alt="" />
            <div>
              <p className="account-menu__hi">
                {name ? `Welcome back` : `Hey there 🐾`}
              </p>
              <span className="account-menu__sub">{name || "Guest"}</span>
            </div>
          </div>

          <button
            className="account-menu__item"
            role="menuitem"
            onClick={run(openWishlist)}
          >
            <IconStar className="account-menu__icon" />
            My wishlist
            {wishlistCount > 0 && (
              <span className="account-menu__count">{wishlistCount}</span>
            )}
          </button>

          <button
            className="account-menu__item"
            role="menuitem"
            onClick={run(openCart)}
          >
            <IconCart className="account-menu__icon" />
            My cart
            {cartCount > 0 && (
              <span className="account-menu__count">{cartCount}</span>
            )}
          </button>

          <Link
            href="/cart"
            className="account-menu__item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <IconTruck className="account-menu__icon" />
            Order history
          </Link>

          <div className="account-menu__divider" />

          {name ? (
            <button
              className="account-menu__item account-menu__signout"
              onClick={signOut}
            >
              <IconClose className="account-menu__icon" />
              Sign out
            </button>
          ) : (
            <button className="account-menu__signin" onClick={signIn}>
              Sign in
            </button>
          )}
        </div>
      )}
    </div>
  );
}
