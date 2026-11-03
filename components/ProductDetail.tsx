"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CATEGORY_ACCENT, PRODUCTS } from "@/lib/catalog";
import { formatPrice } from "@/lib/money";
import { FREE_SHIPPING_THRESHOLD_CENTS } from "@/lib/pricing";
import type { Category, Product, ProductImage, ProductLabel } from "@/lib/types";
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

// Fallback copy for older products without their own description.
const CATEGORY_COPY: Partial<Record<Category, { blurb: string; features: string[] }>> = {
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
  { icon: IconTruck, label: `Free delivery over ${formatPrice(FREE_SHIPPING_THRESHOLD_CENTS).replace(/\.00$/, "")}` },
  { icon: IconHeart, label: "Picked by pet people" },
  { icon: IconShield, label: "30-day easy returns" },
];

/** Printed label text, grouped into sections. Only sections with content render. */
function LabelDetails({ label, attributes }: { label?: ProductLabel; attributes?: Record<string, string> }) {
  const sections: { title: string; body: ReactNode }[] = [];
  if (label?.story) sections.push({ title: label.tagline ? `About the range` : "About", body: <p>{label.story}</p> });
  if (label?.ingredients || label?.keyIngredients)
    sections.push({
      title: "Ingredients",
      body: (
        <>
          {label.ingredients && <p>{label.ingredients}</p>}
          {!label.ingredients && label.keyIngredients && (
            <p>
              {label.keyIngredients}
              <span className="product-label__note"> (key ingredients from the front of the pack)</span>
            </p>
          )}
        </>
      ),
    });
  if (label?.nutrition?.length)
    sections.push({
      title: "Nutrition facts",
      body: (
        <table className="product-label__table">
          <tbody>
            {label.nutrition.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    });
  if (label?.feeding?.length || label?.feedingText)
    sections.push({
      title: "Feeding guide",
      body: (
        <>
          {label.feeding?.length ? (
            <table className="product-label__table">
              <thead>
                <tr>
                  <th scope="col">Dog weight</th>
                  <th scope="col">Portion per day</th>
                </tr>
              </thead>
              <tbody>
                {label.feeding.map((row) => (
                  <tr key={row.weight}>
                    <td>{row.weight}</td>
                    <td>{row.portionPerDay}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {label.feedingText && <p>{label.feedingText}</p>}
        </>
      ),
    });
  if (label?.benefits?.length)
    sections.push({
      title: "Benefits",
      body: (
        <ul className="product-label__list">
          {label.benefits.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ),
    });
  if (label?.storage || label?.advisory?.length || label?.note || label?.bestBefore)
    sections.push({
      title: "Storage & safety",
      body: (
        <>
          {label.storage && <p>{label.storage}</p>}
          {label.advisory?.map((a) => <p key={a}>{a}</p>)}
          {label.bestBefore && <p>Best before: {label.bestBefore}.</p>}
          {label.note && <p className="product-label__strong">{label.note}</p>}
        </>
      ),
    });
  if (attributes && Object.keys(attributes).length)
    sections.push({
      title: "Details",
      body: (
        <table className="product-label__table">
          <tbody>
            {Object.entries(attributes).map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ),
    });
  if (label?.packedAndMarketedBy || label?.manufacturedBy || label?.contact)
    sections.push({
      title: "Made by",
      body: (
        <>
          {label.manufacturedBy && <p>Manufactured by: {label.manufacturedBy}</p>}
          {label.packedAndMarketedBy && <p>Packed &amp; marketed by: {label.packedAndMarketedBy}</p>}
          {label.contact && (
            <p>
              Queries, feedback &amp; complaints: <a href={`mailto:${label.contact}`}>{label.contact}</a>
            </p>
          )}
        </>
      ),
    });
  if (sections.length === 0) return null;
  return (
    <section className="product-label" aria-labelledby="product-label-title" data-reveal>
      <h2 id="product-label-title" className="product-label__title">
        product details
      </h2>
      {sections.map((section, i) => (
        <details key={section.title} className="product-label__section" open={i < 2}>
          <summary>{section.title}</summary>
          <div className="product-label__body">{section.body}</div>
        </details>
      ))}
    </section>
  );
}

interface ProductDetailProps {
  product: Product;
  /** Admin preview of an unpublished product: no buying, shows what's missing. */
  preview?: { status: string; problems: string[]; editHref: string };
}

export default function ProductDetail({ product, preview }: ProductDetailProps) {
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
  // Products with their own (printed) description don't get the generic category copy.
  const copy = product.description ? undefined : CATEGORY_COPY[product.category];
  const features = product.label?.features ?? copy?.features ?? [];

  const gallery: ProductImage[] = product.images?.length
    ? product.images
    : [{ src: product.img, alt: product.name, view: "front" }];
  const [shown, setShown] = useState(0);
  const current = gallery[Math.min(shown, gallery.length - 1)]!;

  // Pack sizes: each is sold as its own item (SKU), so the cart and checkout
  // price exactly the pack that was chosen.
  const packs = product.variants ?? [];
  // Every product page uses the premium layout; the pack selector only shows when there are packs.
  const premium = true;
  const hasPacks = packs.length > 0;
  const [packIndex, setPackIndex] = useState(() => Math.max(0, packs.findIndex((v) => v.stock > 0)));
  const pack = packs[Math.min(packIndex, packs.length - 1)];
  const sku = pack?.sku ?? product.id;
  const unitCents = pack?.priceCents ?? product.priceCents;
  const wasCents = pack ? pack.compareAtCents : product.compareAtCents;
  const unitStock = pack?.stock ?? product.stock;
  const discount = wasCents && wasCents > unitCents ? Math.round((1 - unitCents / wasCents) * 100) : 0;
  const perGramCents = pack?.grams ? Math.round(unitCents / pack.grams) : null;

  const inCart = items.find((line) => line.id === sku)?.qty ?? 0;
  // You can't pick more than the warehouse can still send you.
  const maxQty = Math.max(0, unitStock - inCart);
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
    addItem(sku, qty); // optimistic: the cart updates right away
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

  const addLabel =
    unitStock === 0
      ? "sold out"
      : soldOutForYou
        ? "all available stock is in your cart"
        : premium
          ? "add to cart"
          : `add to cart · ${formatPrice(unitCents * qty)}`;

  const buyNow = () => {
    addItem(sku, qty);
    router.push("/cart");
  };

  const choosePack = (i: number) => {
    setPackIndex(i);
    setQty(1);
  };

  const stockPill = premium && !preview && !product.comingSoon && (
    <p className={`product-stock-pill ${unitStock === 0 ? "is-out" : unitStock <= 5 ? "is-low" : ""}`}>
      {unitStock === 0 ? "Sold out" : unitStock <= 5 ? `Only ${unitStock} left` : "In stock"}
    </p>
  );

  const about = (
    <>
      {(product.description || copy) && <p className="product-info__blurb">{product.description || copy?.blurb}</p>}
      {product.label?.keyIngredients && <p className="product-info__key">{product.label.keyIngredients}</p>}
      {features.length > 0 && (
        <ul className="product-info__features">
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <div
      className={`cozy-page product-page ${premium ? "product-page--premium" : ""}`}
      style={{ "--accent": accent } as CSSProperties}
      ref={pageRef}
    >
      <SiteHeader />

      {preview && (
        <div className="shop-preview-banner" role="note">
          <p>
            <strong>Preview ({preview.status}).</strong> Customers can&apos;t see or buy this product yet.{" "}
            <Link href={preview.editHref}>Edit product</Link> · <Link href="/admin/preview/shop">Shop preview</Link>
          </p>
          {preview.problems.length > 0 && (
            <ul>
              {preview.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <nav className="product-breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        <span>/</span>
        <Link href={preview ? "/admin/preview/shop" : "/shop"}>Shop</Link>
        <span>/</span>
        <span className="is-current">{product.name}</span>
      </nav>

      <section className="product-main">
        <div className="product-media" data-reveal>
          <div className="product-gallery img-slot">
            <span className="product-gallery__blob" aria-hidden="true" />
            <SmartImage
              key={current.src}
              ref={imageRef}
              src={current.src}
              alt={current.alt || product.name}
              width={800}
              height={800}
              fetchPriority={shown === 0 ? "high" : undefined}
              sizes="(max-width: 768px) 100vw, 560px"
              style={{ viewTransitionName: "product-image" }}
            />
            {product.badge && <span className="product-gallery__badge">{product.badge}</span>}
          </div>
          {gallery.length > 1 && (
            <div className="product-thumbs" role="group" aria-label="Product photos">
              {gallery.map((img, i) => (
                <button
                  key={img.src}
                  type="button"
                  className="product-thumbs__item img-slot"
                  aria-pressed={i === shown}
                  aria-label={`Show photo ${i + 1} of ${gallery.length}: ${img.alt}`}
                  onClick={() => setShown(i)}
                >
                  <SmartImage src={img.src} alt="" width={120} height={120} loading="lazy" sizes="88px" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="product-info" data-reveal data-reveal-delay="0.1">
          <span className="product-info__category">
            {[product.brand, product.subcategory ?? product.category].filter(Boolean).join(" · ")}
          </span>
          <h1 className="product-info__name">{product.name}</h1>
          {stockPill}

          <div className="product-price">
            <p className="product-info__price">
              {product.comingSoon ? (
                <span className="product-info__soon">price coming soon</span>
              ) : preview && unitCents === 0 ? (
                <span className="product-info__no-price">no selling price yet</span>
              ) : (
                <>
                  <span className="product-price__now">{formatPrice(unitCents)}</span>
                  {wasCents && wasCents > unitCents && (
                    <s className="product-info__was">
                      <span className="visually-hidden">was </span>
                      {formatPrice(wasCents)}
                    </s>
                  )}
                  {discount > 0 && <span className="product-price__off">{discount}% off</span>}
                </>
              )}
            </p>
            {perGramCents !== null && !product.comingSoon && (
              <p className="product-price__unit">
                {formatPrice(perGramCents)} per gram{pack ? ` · ${pack.label} pack` : ""}
              </p>
            )}
          </div>

          {hasPacks && !product.comingSoon && (
            <fieldset className="product-packs">
              <legend className="product-packs__title">select pack size</legend>
              <div className="product-packs__options">
                {packs.map((v, i) => (
                  <label
                    key={v.sku}
                    className={`product-pack ${i === packIndex ? "is-selected" : ""} ${v.stock === 0 ? "is-out" : ""}`}
                  >
                    <input
                      type="radio"
                      name={`pack-${product.id}`}
                      value={v.sku}
                      checked={i === packIndex}
                      disabled={v.stock === 0}
                      onChange={() => choosePack(i)}
                      className="visually-hidden"
                    />
                    <span className="product-pack__label">{v.label}</span>
                    <span className="product-pack__price">{v.stock === 0 ? "sold out" : formatPrice(v.priceCents)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {!premium && about}

          {preview || product.comingSoon ? (
            <div className="product-info__buy">
              <button type="button" className="cozy-btn-orange product-add" disabled>
                <span className="product-add__label">
                  {product.comingSoon ? "coming soon · not available to order yet" : "draft · not for sale"}
                </span>
              </button>
              {product.comingSoon && !preview && (
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
              )}
            </div>
          ) : (
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
          )}

          {!preview && !product.comingSoon && !premium && product.stock <= 5 && (
            <p className="product-info__stock">
              Only {product.stock} left{inCart > 0 ? ` · ${inCart} in your cart` : ""}
            </p>
          )}
          {premium && !product.comingSoon && unitStock > 0 && (qty > 1 || hasPacks) && (
            <p className="product-info__total" aria-live="polite">
              {qty > 1
                ? `${formatPrice(unitCents * qty)} for ${qty} ${hasPacks ? "packs" : "items"}`
                : `${formatPrice(unitCents)} for 1 pack`}
              {inCart > 0 ? ` · ${inCart} already in your cart` : ""}
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

          {premium && <div className="product-about">{about}</div>}
        </div>
      </section>

      <LabelDetails label={product.label} attributes={product.attributes} />

      {!preview && !product.comingSoon && (
      <div
        className="product-sticky"
        data-visible={showStickyBuy || undefined}
        aria-hidden={!showStickyBuy}
        inert={!showStickyBuy}
      >
        <img ref={stickyImageRef} src={current.src} alt="" width={44} height={44} />
        <div className="product-sticky__text">
          <p className="product-sticky__name">
            {product.name}
            {pack ? ` · ${pack.label}` : ""}
          </p>
          <p className="product-sticky__price">{formatPrice(unitCents)}</p>
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
      )}

      {related.length > 0 && (
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
              <p className="related-card__price">
                {item.comingSoon ? "price coming soon" : `${item.variants && item.variants.length > 1 ? "from " : ""}${formatPrice(item.priceCents)}`}
              </p>
            </Link>
          ))}
        </div>
      </section>
      )}

      <SiteFooter />
    </div>
  );
}
