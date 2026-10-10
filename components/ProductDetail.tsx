"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CATEGORY_ACCENT, PRODUCTS } from "@/lib/catalog";
import { formatPrice } from "@/lib/money";
import type { Category, Product } from "@/lib/types";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { useScrollReveal } from "@/lib/useScrollReveal";
import { flyToCart } from "@/lib/fly-to-cart";
import { usePop } from "@/lib/hooks/usePop";
import SiteHeader from "@/components/SiteHeader";
import SmartImage from "@/components/SmartImage";
import QtyNumber from "@/components/QtyNumber";
import SiteFooter from "@/components/SiteFooter";
import {
  IconPlus,
  IconMinus,
  IconStar,
  IconArrowUpRight,
  IconTruck,
  IconHeart,
  IconShield,
  IconCheck,
} from "@/components/icons";

const CATEGORY_COPY: Record<Category, { blurb: string; features: string[] }> = {
  "food & treats": {
    blurb:
      "Wholesome, vet-approved nutrition your pet will do zoomies for. Made in small batches with real ingredients — nothing artificial, ever.",
    features: [
      "Real, human-grade ingredients",
      "No fillers, dyes or nasties",
      "Loved by picky eaters",
    ],
  },
  "toys & play": {
    blurb:
      "Built for the roughest games of tug and the longest afternoons of fetch. Tough, bouncy and endlessly re-squeakable.",
    features: [
      "Chew-tested by real power chewers",
      "Non-toxic, pet-safe materials",
      "Keeps busy brains happy",
    ],
  },
  "comfy beds": {
    blurb:
      "The coziest spot in the house. Orthopedic support and cloud-soft cushioning for dreamy naps and happy joints.",
    features: [
      "Supportive memory-foam base",
      "Machine-washable cover",
      "Cozy, den-like comfort",
    ],
  },
  "walk & travel": {
    blurb:
      "Adventure-ready gear that keeps tails wagging on every trail. Comfortable, secure and made to go the distance.",
    features: [
      "Padded, no-chafe fit",
      "Weatherproof and durable",
      "Easy on, easy off",
    ],
  },
  "grooming & care": {
    blurb:
      "Spa-day essentials that keep your best friend clean, fresh and cuddle-ready — gentle on skin, tough on tangles.",
    features: [
      "Gentle, natural formulas",
      "Vet & groomer recommended",
      "Kind to sensitive skin",
    ],
  },
};

const TRUST = [
  { icon: IconTruck, label: "Free delivery over $50" },
  { icon: IconHeart, label: "Picked by pet people" },
  { icon: IconShield, label: "30-day easy returns" },
];


export default function ProductDetail({ product }: { product: Product }) {
  const router = useRouter();
  const { addItem, openCart, items, cartTargetRef } = useCart();
  const imageRef = useRef<HTMLImageElement>(null);
  const stickyImageRef = useRef<HTMLImageElement>(null);
  const { has: isSaved, toggle: toggleSaved } = useWishlist();
  const [popping, pop] = usePop();
  const [qty, setQty] = useState(1);
  const pageRef = useRef<HTMLDivElement>(null);
  useScrollReveal(pageRef);

  const saved = isSaved(product.id);

  const accent = CATEGORY_ACCENT[product.category];
  const copy = CATEGORY_COPY[product.category];
  const inCart = items.find((line) => line.id === product.id)?.qty ?? 0;
  // You can't pick more than the warehouse can still send you.
  const maxQty = Math.max(0, product.stock - inCart);
  const soldOutForYou = maxQty === 0;

  const related = PRODUCTS.filter(
    (p) => p.category === product.category && p.id !== product.id,
  )
    .concat(PRODUCTS.filter((p) => p.category !== product.category))
    .slice(0, 4);

  // "added ✓" confirmation on the button itself, so feedback happens where
  // the user is looking, not only in the drawer that slides in.
  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(addedTimer.current), []);

  const addToCart = (source: HTMLImageElement | null = imageRef.current) => {
    addItem(product.id, qty); // optimistic: the cart updates right away
    setQty(1);
    setJustAdded(true);
    window.clearTimeout(addedTimer.current);
    addedTimer.current = window.setTimeout(() => setJustAdded(false), 1600);
    // Let the image land in the cart icon before the drawer slides over it.
    void flyToCart(source, cartTargetRef.current).then(openCart);
  };

  // Mobile: once the main buy button scrolls away, a slim bar keeps it in reach.
  const buyRef = useRef<HTMLDivElement>(null);
  const [showStickyBuy, setShowStickyBuy] = useState(false);
  useEffect(() => {
    const target = buyRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      setShowStickyBuy(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const addLabel = soldOutForYou
    ? "all available stock is in your cart"
    : `add to cart · ${formatPrice(product.priceCents * qty)}`;

  const buyNow = () => {
    addItem(product.id, qty);
    router.push("/cart");
  };

  return (
    <div className="cozy-page product-page" style={{ "--accent": accent } as CSSProperties} ref={pageRef}>
      <SiteHeader />

      <nav className="product-breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span>/</span>
        <Link href="/shop">Shop</Link>
        <span>/</span>
        <span className="is-current">{product.name}</span>
      </nav>

      <section className="product-main">
        <div className="product-gallery img-slot" data-reveal>
          <span className="product-gallery__blob" aria-hidden="true" />
          <SmartImage
            ref={imageRef}
            src={product.img}
            alt={product.name}
            width={800}
            height={800}
            fetchPriority="high"
            sizes="(max-width: 768px) 100vw, 560px"
            style={{ viewTransitionName: "product-image" }}
          />
          {product.badge && (
            <span className="product-gallery__badge">{product.badge}</span>
          )}
        </div>

        <div className="product-info" data-reveal data-reveal-delay="0.1">
          <span className="product-info__category">{product.category}</span>
          <h1 className="product-info__name">{product.name}</h1>

          <p className="product-info__price">{formatPrice(product.priceCents)}</p>
          <p className="product-info__blurb">{copy.blurb}</p>

          {copy.features.length > 0 && (
            <ul className="product-info__features">
              {copy.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          )}

          <div className="product-info__buy" ref={buyRef}>
            <div className="product-qty" role="group" aria-label="Quantity">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={qty <= 1}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                <IconMinus />
              </button>
              <span aria-live="polite">
                <QtyNumber value={qty} />
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={qty >= maxQty}
                onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
              >
                <IconPlus />
              </button>
            </div>
            <button
              type="button"
              className={`cozy-btn-orange product-add ${justAdded ? "is-added" : ""}`}
              onClick={() => addToCart()}
              disabled={soldOutForYou}
            >
              <span className="product-add__label">{addLabel}</span>
              <span className="product-add__done" aria-hidden="true">
                <IconCheck /> added
              </span>
            </button>
            <button type="button" className="product-buy-now" onClick={buyNow} disabled={soldOutForYou}>
              buy now
            </button>
            <button
              className={`product-fav ${saved ? "is-saved" : ""}`}
              data-pop={popping === product.id || undefined}
              aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
              aria-pressed={saved}
              onClick={() => {
                if (!saved) pop(product.id);
                toggleSaved(product.id);
              }}
            >
              <IconStar fill={saved ? "currentColor" : "none"} />
            </button>
          </div>

          {product.stock <= 5 && (
            <p className="product-info__stock">
              Only {product.stock} left{inCart > 0 ? ` · ${inCart} in your cart` : ""}
            </p>
          )}

          <ul className="product-trust">
            {TRUST.map(({ icon: Icon, label }) => (
              <li key={label}>
                <Icon />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div
        className="product-sticky"
        data-visible={showStickyBuy || undefined}
        aria-hidden={!showStickyBuy}
        inert={!showStickyBuy}
      >
        <img ref={stickyImageRef} src={product.img} alt="" width={44} height={44} />
        <div className="product-sticky__text">
          <p className="product-sticky__name">{product.name}</p>
          <p className="product-sticky__price">{formatPrice(product.priceCents)}</p>
        </div>
        <button
          type="button"
          className={`cozy-btn-orange product-sticky__add ${justAdded ? "is-added" : ""}`}
          onClick={() => addToCart(stickyImageRef.current)}
          disabled={soldOutForYou}
        >
          {justAdded ? "added ✓" : soldOutForYou ? "in your cart" : "add to cart"}
        </button>
      </div>

      <section className="product-related">
        <h2 className="product-related__title" data-reveal>
          you may also like
        </h2>
        <div className="product-related__grid">
          {related.map((item) => (
            <Link
              key={item.id}
              href={`/shop/${item.id}`}
              className="related-card"
              data-reveal
              style={{ "--accent": CATEGORY_ACCENT[item.category] } as CSSProperties}
            >
              <div className="related-card__img img-slot">
                <SmartImage src={item.img} alt="" width={800} height={800} loading="lazy" sizes="(max-width: 768px) 50vw, 260px" />
                <span className="related-card__view">
                  <IconArrowUpRight />
                </span>
              </div>
              <p className="related-card__name">{item.name}</p>
              <p className="related-card__price">{formatPrice(item.priceCents)}</p>
            </Link>
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
