"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import AccountMenu from "@/components/AccountMenu";
import { REMOTE_ASSETS } from "@/lib/remote-assets";
import { useBump } from "@/lib/hooks/useBump";
import { IconCart, IconStar, IconMenu, IconClose } from "@/components/icons";

const LOGO_SRC = REMOTE_ASSETS.logo;

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const { count, openCart, hydrated, cartTargetRef } = useCart();
  const cartBump = useBump(count, hydrated);
  const { count: wishlistCount, openWishlist } = useWishlist();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="site-header">
      <Link
        href="/"
        className="site-header__logo-link"
        aria-label="The Nuzz Story home"
      >
        <img src={LOGO_SRC} alt="The Nuzz Story" className="site-header__logo" width={2172} height={724} />
      </Link>

      <nav className="site-header__nav" aria-label="Primary">
        {NAV_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={isActive(href) ? "is-active" : ""}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="site-header__actions">
        <button
          className="cozy-icon-btn cozy-icon-btn--orange"
          aria-label="Wishlist"
          onClick={openWishlist}
        >
          <IconStar className="cozy-icon" />
          {wishlistCount > 0 && (
            <span className="cozy-badge">{wishlistCount}</span>
          )}
        </button>
        <button
          ref={cartTargetRef}
          className="cozy-icon-btn"
          aria-label={count > 0 ? `Open cart, ${count} item${count === 1 ? "" : "s"}` : "Open cart"}
          onClick={openCart}
        >
          <IconCart className="cozy-icon" />
          {count > 0 && (
            <span key={cartBump} className={`cozy-badge ${cartBump ? "cozy-badge--bump" : ""}`} aria-hidden="true">
              {count}
            </span>
          )}
        </button>
        <AccountMenu />
        <button
          className="cozy-icon-btn site-header__burger"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? (
            <IconClose className="cozy-icon" />
          ) : (
            <IconMenu className="cozy-icon" />
          )}
        </button>
      </div>

      <nav
        className={`site-header__mobile ${menuOpen ? "is-open" : ""}`}
        aria-label="Mobile"
      >
        {NAV_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={isActive(href) ? "is-active" : ""}
            onClick={() => setMenuOpen(false)}
          >
            {label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
