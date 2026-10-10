"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconMenu, IconClose } from "@/components/icons";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

/**
 * Burger button + full-screen menu for touch / small screens.
 * The homepage's two headers (CozyHero + Navbar) reveal navigation on hover,
 * which doesn't work on mobile/tablet — this gives those viewers a tap target.
 * `className` scopes when the burger is shown (see navbar.css).
 */
export default function MobileNav({ className = "" }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`nav-burger ${className}`}
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <IconMenu width="26" height="26" />
      </button>

      <div className={`nav-mobile-menu ${open ? "is-open" : ""}`}>
        <button
          type="button"
          className="nav-mobile-menu__close"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        >
          <IconClose width="28" height="28" />
        </button>
        <nav className="nav-mobile-menu__links" aria-label="Mobile">
          {NAV_LINKS.map(({ href, label }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
