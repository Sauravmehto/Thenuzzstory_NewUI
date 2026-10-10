"use client";

import Link from "next/link";
import { SOCIAL_ICONS } from "@/lib/data";
import { STORE } from "@/lib/contact-places";
import { IconArrowUpRight } from "@/components/icons";

const SHOP_LINKS = [
  { href: "/shop", label: "All products" },
  { href: "/shop?category=food%20%26%20treats", label: "Food & treats" },
  { href: "/shop?category=toys%20%26%20play", label: "Toys & play" },
  { href: "/shop?category=comfy%20beds", label: "Comfy beds" },
];

const COMPANY_LINKS = [
  { href: "/about", label: "About us" },
  { href: "/contact", label: "Contact" },
  { href: "/cart", label: "Your cart" },
  { href: "/", label: "Back home" },
];

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__top">
        <div className="site-footer__brand">
          <h2 className="site-footer__wordmark">
            <img
              src="/assets/brand/nuzzstorylogo.png"
              alt="The Nuzz Story"
              width={2172}
              height={724}
            />
          </h2>
          <p className="site-footer__tagline">
            Everything your pet loves — toys, treats and cozy essentials,
            delivered with a wagging tail.
          </p>
          <img
            src="/assets/pets/paw-sticker.svg"
            alt=""
            aria-hidden="true"
            className="site-footer__paw"
          />
        </div>

        <div className="site-footer__col">
          <h3>Shop</h3>
          {SHOP_LINKS.map(({ href, label }) => (
            <Link key={label} href={href}>
              {label}
            </Link>
          ))}
        </div>

        <div className="site-footer__col">
          <h3>Company</h3>
          {COMPANY_LINKS.map(({ href, label }) => (
            <Link key={label} href={href}>
              {label}
            </Link>
          ))}
        </div>

        <div className="site-footer__col">
          <h3>Visit us</h3>
          <address className="site-footer__address">
            {STORE.addressLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </address>
          <a href={STORE.phoneHref} className="site-footer__phone">
            {STORE.phone}
          </a>
          <a href={STORE.mapsUrl} className="site-footer__directions" target="_blank" rel="noopener noreferrer">
            Get directions
            <IconArrowUpRight className="site-footer__email-icon" aria-hidden="true" />
            <span className="visually-hidden"> (opens Google Maps)</span>
          </a>
          <a href="mailto:hello@thenuzzstory.co" className="site-footer__email">
            hello@thenuzzstory.co
          </a>
          <div className="site-footer__socials">
            {SOCIAL_ICONS.map(({ href, label, svg }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="site-footer__bottom">
        <span>© {new Date().getFullYear()} The Nuzz Story. A demo pet store.</span>
        <span>made with 🐾 for good dogs &amp; cats</span>
      </div>
    </footer>
  );
}
