"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import AccountMenu from "@/components/AccountMenu";
import MobileNav from "@/components/MobileNav";
import { REMOTE_ASSETS } from "@/lib/remote-assets";
import SmartImage from "@/components/SmartImage";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useMagnetic } from "@/lib/hooks/useMagnetic";
import { useHeroPointer } from "@/lib/hooks/useHeroPointer";

const ASSETS = {
  logo: REMOTE_ASSETS.logo,
  avatar: REMOTE_ASSETS.avatar,
  productCard: "/assets/pets/house1.avif",
  videoCard: "/assets/pets/dog2.avif",
  bottomLeft: REMOTE_ASSETS.heroBottomLeft,
  bottomCenter: REMOTE_ASSETS.heroBottomCenter,
  bottomRight: REMOTE_ASSETS.heroBottomRight,
};

const POINTER_CURSOR = {
  cursor: "url('/assets/Cursor SVG/cursor-pointer.svg') 12 12, pointer",
};

function IconSearch(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
function IconCart(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />
    </svg>
  );
}
function IconStar({ filled, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function IconArrowUpRight(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M7 7h10v10" />
      <path d="M7 17 17 7" />
    </svg>
  );
}
function IconPlay(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinejoin="round"
      {...props}
    >
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}
function IconArrowRight(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
function IconPlus(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

// Counts 0 → 98 as the stat fades in. Only runs if the number hasn't been
// seen yet (on a slow phone that hydrates late, it just stays at 98K+).
function CountUp({ to, suffix }) {
  const ref = useRef(null);
  const [value, setValue] = useState(to);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const host = el.closest(".cozy-overlay, .cozy-mobile__stats");
    if (host && Number(getComputedStyle(host).opacity) > 0.1) return;
    let frame = 0;
    let start = 0;
    const delay = 900;
    const duration = 1400;
    setValue(0);
    const tick = (now) => {
      if (!start) start = now + delay;
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to]);
  return (
    <>
      {/* data-final reserves the final width, so nothing shifts while counting */}
      <span ref={ref} aria-hidden="true" className="cozy-countup" data-final={`${to}${suffix}`}>
        <span>
          {value}
          {suffix}
        </span>
      </span>
      <span className="visually-hidden">
        {to}
        {suffix}
      </span>
    </>
  );
}

// Hero headline split into letters so they can ripple under the cursor.
// Screen readers get the word from aria-label, not letter by letter.
function Letters({ word }) {
  return (
    <span aria-hidden="true">
      {Array.from(word).map((ch, i) => (
        <span key={i} className="cozy-letter">
          {ch}
        </span>
      ))}
    </span>
  );
}

function StatOverlay({ className = "" }) {
  return (
    <div className={`cozy-stat ${className}`}>
      <div className="cozy-avatar-stack">
        <span className="cozy-avatar-badge" aria-hidden="true">
          <svg viewBox="0 0 512 512" fill="currentColor">
            <ellipse cx="256" cy="352" rx="120" ry="96" />
            <ellipse cx="118" cy="220" rx="52" ry="70" />
            <ellipse cx="212" cy="140" rx="48" ry="66" />
            <ellipse cx="300" cy="140" rx="48" ry="66" />
            <ellipse cx="394" cy="220" rx="52" ry="70" />
          </svg>
        </span>
        <span className="cozy-avatar-plus">
          <IconPlus />
        </span>
      </div>
      <span className="cozy-stat__value">
        <CountUp to={98} suffix="K+" />
      </span>
    </div>
  );
}

function RatingOverlay({ className = "" }) {
  return (
    <div className={`cozy-rating ${className}`}>
      <span className="cozy-rating__star-wrap" aria-hidden="true">
        <IconStar filled className="cozy-rating__star" />
      </span>
      <span>4.6</span>
    </div>
  );
}

export default function CozyHero() {
  const heroRef = useRef(null);
  const router = useRouter();
  const { count: cartCount, openCart } = useCart();
  const { count: wishlistCount, openWishlist } = useWishlist();
  const [searchOpen, setSearchOpen] = useState(false);

  const runSearch = (e) => {
    e.preventDefault();
    const term = e.currentTarget.elements.q.value.trim();
    setSearchOpen(false);
    router.push(term ? `/shop?q=${encodeURIComponent(term)}` : "/shop");
  };

  // The site navbar is fixed (z-index 1000) and would sit on top of this
  // hero's own header: CSS hides it until html[data-past-hero] is set.
  useEffect(() => {
    const root = document.documentElement;
    const hero = heroRef.current;
    if (!hero) return;

    // Measure once (and on resize), not on every scroll event.
    let heroBottom = hero.offsetTop + hero.offsetHeight;
    const onResize = () => {
      heroBottom = hero.offsetTop + hero.offsetHeight;
      onScroll();
    };
    const onScroll = () => {
      root.toggleAttribute("data-past-hero", window.scrollY >= heroBottom - 100);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      root.removeAttribute("data-past-hero");
    };
  }, []);

  // Depth on scroll: the three pets sink behind the green ledge at different
  // speeds as the hero scrolls away. Desktop + motion-OK only.
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add("(min-width: 769px) and (prefers-reduced-motion: no-preference)", () => {
      const photos = hero.querySelectorAll(".cozy-photos:not(.cozy-photos--mobile) .cozy-photos__item > img");
      const depth = [18, 10, 22];
      photos.forEach((img, i) => {
        gsap.to(img, {
          yPercent: depth[i] ?? 12,
          ease: "none",
          scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 0.4 },
        });
      });
    });
    return () => mm.revert();
  }, []);

  const exploreRef = useRef(null);
  useMagnetic(exploreRef);
  const stageRef = useRef(null);
  useHeroPointer(stageRef);

  return (
    <section className="cozy-hero" ref={heroRef}>
      <header className="cozy-header cozy-fade-in cozy-delay-100">
        <img src={ASSETS.logo} alt="The Nuzz Story" className="cozy-header__logo" width={2172} height={724} />
        <nav className="cozy-header__nav">
          <a href="/" className="is-active" style={POINTER_CURSOR}>
            Home
          </a>
          <a href="/shop" style={POINTER_CURSOR}>
            Shop
          </a>
          <a href="/about" style={POINTER_CURSOR}>
            About
          </a>
          <a href="/contact" style={POINTER_CURSOR}>
            Contact
          </a>
        </nav>
        <div className="cozy-header__actions">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="cozy-icon-btn cozy-header__search"
            aria-label="Search"
            aria-expanded={searchOpen}
            style={POINTER_CURSOR}
          >
            <IconSearch className="cozy-icon" />
          </button>
          <button
            type="button"
            onClick={openWishlist}
            className="cozy-icon-btn cozy-icon-btn--orange"
            aria-label="Wishlist"
            style={POINTER_CURSOR}
          >
            <IconStar filled className="cozy-icon" />
            {wishlistCount > 0 && (
              <span className="cozy-badge">{wishlistCount}</span>
            )}
          </button>
          <button
            type="button"
            onClick={openCart}
            className="cozy-icon-btn"
            aria-label="Open cart"
            style={POINTER_CURSOR}
          >
            <IconCart className="cozy-icon" />
            {cartCount > 0 && <span className="cozy-badge">{cartCount}</span>}
          </button>
          <AccountMenu />
          {/* Mobile menu — the nav links above are hidden below 768px */}
          <MobileNav className="nav-burger--cozy" />
        </div>
      </header>

      {searchOpen && (
        <div
          className="cozy-search"
          role="dialog"
          aria-label="Search products"
          onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}
        >
          <button
            className="cozy-search__backdrop"
            aria-label="Close search"
            onClick={() => setSearchOpen(false)}
          />
          <form className="cozy-search__bar" onSubmit={runSearch}>
            <IconSearch className="cozy-search__icon" />
            <input
              type="search"
              name="q"
              autoFocus
              placeholder="Search treats, toys, beds…"
              className="cozy-search__input"
            />
            <button
              type="submit"
              className="cozy-search__submit"
              style={POINTER_CURSOR}
            >
              Search
            </button>
          </form>
        </div>
      )}

      <div className="cozy-hero__stage" ref={stageRef}>
        <div className="cozy-hero__heading-wrap">
          <h1 className="cozy-hero__heading" aria-label="Everything Your Pets Love">
            <span className="cozy-hero__line">
              <span className="cozy-word cozy-delay-200"><Letters word="Everything" /></span>
            </span>
            <span className="cozy-hero__line">
              <span className="cozy-word cozy-delay-400"><Letters word="Your" /></span>{" "}
              <span className="cozy-word cozy-delay-500"><Letters word="Pets" /></span>{" "}
              <span className="cozy-word cozy-delay-600"><Letters word="Love" /></span>
            </span>
          </h1>
        </div>

        <div className="cozy-card cozy-card--product cozy-slide-in-left cozy-delay-600" data-tilt>
          <div className="cozy-card__img-wrap">
            <SmartImage src={ASSETS.productCard} alt="Cozy Dog House" width={900} height={1350} loading="eager" sizes="210px" />
            <a
              href="/shop"
              className="cozy-card__arrow-btn"
              aria-label="View product"
              style={POINTER_CURSOR}
            >
              <IconArrowUpRight />
            </a>
          </div>
          <p className="cozy-card__name">Cozy Dog House</p>
          <p className="cozy-card__price">$49.99</p>
        </div>

        <div className="cozy-card cozy-card--video cozy-slide-in-right cozy-delay-700" data-tilt>
          <div className="cozy-card__img-wrap cozy-card__img-wrap--video">
            <SmartImage src={ASSETS.videoCard} alt="Product review videos" width={834} height={1161} loading="eager" sizes="150px" />
            <div className="cozy-card__video-overlay">
              <button
                className="cozy-play-btn"
                aria-label="Play video"
                style={POINTER_CURSOR}
              >
                <IconPlay />
              </button>
              <p>Watch Product Reviews on TikTok and YouTube</p>
            </div>
          </div>
        </div>

        <div className="cozy-photos">
          <div className="cozy-photos__item cozy-photos__item--side cozy-photo-reveal cozy-delay-700" data-says="woof!">
            <SmartImage src={ASSETS.bottomLeft} alt="Dachshund peeking over a ledge" width={870} height={762} loading="eager" sizes="(max-width: 768px) 40vw, 33vw" />
            <div className="cozy-overlay cozy-overlay--side cozy-scale-in cozy-delay-1000">
              <StatOverlay />
            </div>
          </div>
          <div className="cozy-photos__item cozy-photos__item--center cozy-photo-reveal cozy-delay-600" data-says="treats?">
            <SmartImage src={ASSETS.bottomCenter} alt="Golden retriever resting its paws on a ledge" width={977} height={1024} loading="eager" sizes="(max-width: 768px) 40vw, 40vw" />
            <div className="cozy-overlay cozy-fade-up cozy-delay-1100">
              <h2 className="cozy-overlay__heading">
                Best Products for Your Pet
              </h2>
              <a
                ref={exploreRef}
                href="/shop"
                className="cozy-btn-orange"
                style={POINTER_CURSOR}
              >
                Explore Products{" "}
                <IconArrowRight className="cozy-btn-orange__icon" />
              </a>
            </div>
          </div>
          <div className="cozy-photos__item cozy-photos__item--side cozy-photo-reveal cozy-delay-900" data-says="meow?">
            <SmartImage src={ASSETS.bottomRight} alt="Ginger cat peeking over a ledge" width={870} height={816} loading="eager" sizes="(max-width: 768px) 40vw, 33vw" />
            <div className="cozy-overlay cozy-overlay--side cozy-scale-in cozy-delay-1200">
              <RatingOverlay />
            </div>
          </div>
        </div>
      </div>

      <div className="cozy-mobile">
        <div className="cozy-mobile__top">
          <h1 className="cozy-mobile__title cozy-fade-up cozy-delay-200">
            Everything Your Pets Love
          </h1>
          <p className="cozy-mobile__subtitle cozy-fade-up cozy-delay-300">
            Toys, treats and cozy essentials for your best friend.
          </p>
          <a
            href="/shop"
            className="cozy-btn-orange cozy-fade-up cozy-delay-400"
            style={POINTER_CURSOR}
          >
            Explore Products{" "}
            <IconArrowRight className="cozy-btn-orange__icon" />
          </a>
        </div>

        <div className="cozy-mobile__cards">
          <div className="cozy-mcard cozy-card-in">
            <div className="cozy-card__img-wrap cozy-mcard__img--square">
              <SmartImage src={ASSETS.productCard} alt="Cozy Dog House" width={900} height={1350} fetchPriority="high" sizes="(max-width: 768px) 45vw, 210px" />
              <a
                href="/shop"
                className="cozy-card__arrow-btn"
                aria-label="View product"
                style={POINTER_CURSOR}
              >
                <IconArrowUpRight />
              </a>
            </div>
            <p className="cozy-card__name">Cozy Dog House</p>
            <p className="cozy-card__price">$49.99</p>
          </div>
          <div className="cozy-mcard cozy-card-in cozy-delay-100">
            <div className="cozy-card__img-wrap cozy-mcard__img--tall">
              <SmartImage src={ASSETS.videoCard} alt="Product review videos" width={834} height={1161} fetchPriority="high" sizes="(max-width: 768px) 45vw, 150px" />
              <div className="cozy-card__video-overlay">
                <button
                  className="cozy-play-btn"
                  aria-label="Play video"
                  style={POINTER_CURSOR}
                >
                  <IconPlay />
                </button>
                <p>Watch Product Reviews on TikTok and YouTube</p>
              </div>
            </div>
          </div>
        </div>

        <div className="cozy-mobile__stats cozy-fade-in cozy-delay-700">
          <StatOverlay className="cozy-stat--on-light" />
          <span className="cozy-mobile__divider" />
          <RatingOverlay className="cozy-rating--on-light" />
        </div>

        <div className="cozy-photos cozy-photos--mobile">
          <div className="cozy-photos__item cozy-photos__item--side cozy-photo-reveal cozy-delay-700">
            <SmartImage src={ASSETS.bottomLeft} alt="Dachshund peeking over a ledge" width={870} height={762} loading="eager" sizes="(max-width: 768px) 40vw, 33vw" />
          </div>
          <div className="cozy-photos__item cozy-photos__item--center cozy-photo-reveal cozy-delay-600">
            <SmartImage src={ASSETS.bottomCenter} alt="Golden retriever resting its paws on a ledge" width={977} height={1024} loading="eager" sizes="(max-width: 768px) 40vw, 33vw" />
          </div>
          <div className="cozy-photos__item cozy-photos__item--side cozy-photo-reveal cozy-delay-800">
            <SmartImage src={ASSETS.bottomRight} alt="Ginger cat peeking over a ledge" width={870} height={816} loading="eager" sizes="(max-width: 768px) 40vw, 33vw" />
          </div>
        </div>
      </div>
    </section>
  );
}
