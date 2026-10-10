"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CARDS_DATA } from "@/lib/data";
import { CATEGORY_ACCENT, PRODUCTS } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { useScrollReveal } from "@/lib/useScrollReveal";
import { formatPrice } from "@/lib/money";
import { flyToCart } from "@/lib/fly-to-cart";
import { usePop } from "@/lib/hooks/usePop";
import { isModifiedClick, navigateWithTransition } from "@/lib/view-transition";
import type { Category } from "@/lib/types";
import SiteHeader from "@/components/SiteHeader";
import SmartImage from "@/components/SmartImage";
import SiteFooter from "@/components/SiteFooter";
import { IconPlus, IconArrowUpRight, IconStar } from "@/components/icons";

type Filter = "all" | Category;
const CATEGORIES: Filter[] = ["all", ...CARDS_DATA.map((card) => card.title as Category)];
const URL_SYNC_DELAY_MS = 250;

/** Wraps each case-insensitive match of `query` in <mark>. */
function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(q, from);
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(<mark key={at}>{text.slice(at, at + q.length)}</mark>);
    from = at + q.length;
    at = lower.indexOf(q, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}

/*
 * Search decision: the catalog is local, so filtering happens on the client
 * with no network request (and so no AbortController or race handling is
 * needed). useDeferredValue keeps typing responsive by letting React render
 * the filtered grid at lower priority. The URL is updated with replace() on a
 * short debounce, so results are shareable without flooding browser history.
 * With a server-side catalog I'd debounce the fetch and abort stale requests.
 */
export default function ShopPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const urlCategory = searchParams.get("category");

  const [term, setTerm] = useState(urlQuery);
  // Category lives in the URL, so a filtered view can be shared or bookmarked.
  const activeCategory: Filter = CATEGORIES.includes(urlCategory as Filter)
    ? (urlCategory as Filter)
    : "all";
  const setActiveCategory = (category: Filter) => {
    const params = new URLSearchParams(searchParams.toString());
    if (category === "all") params.delete("category");
    else params.set("category", category);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const deferredTerm = useDeferredValue(term);
  const query = deferredTerm.trim();
  const isStale = term.trim() !== query;

  const inputRef = useRef<HTMLInputElement>(null);
  const lastSyncedQuery = useRef(urlQuery);

  const { addItem, openCart, items, cartTargetRef } = useCart();
  const { has: isSaved, toggle: toggleSaved } = useWishlist();
  const [popping, pop] = usePop();
  const pageRef = useRef<HTMLDivElement>(null);
  useScrollReveal(pageRef, [activeCategory, query]);

  // Sliding filter highlight: measure the active pill (it can wrap onto a
  // new row on small screens) and move one indicator to it.
  const filtersRef = useRef<HTMLElement>(null);
  const pillRefs = useRef<Partial<Record<Filter, HTMLButtonElement | null>>>({});
  const [indicator, setIndicator] = useState<{ x: number; y: number; w: number; h: number; animate: boolean } | null>(null);
  useEffect(() => {
    const container = filtersRef.current;
    if (!container) return;
    const measure = (animate: boolean) => {
      const pill = pillRefs.current[activeCategory];
      if (!pill) return;
      setIndicator({ x: pill.offsetLeft, y: pill.offsetTop, w: pill.offsetWidth, h: pill.offsetHeight, animate });
    };
    measure(indicator !== null);
    // Re-measure without animating when the layout reflows (resize, font load).
    const observer = new ResizeObserver(() => measure(false));
    observer.observe(container);
    return () => observer.disconnect();
    // Only re-run when the active category changes.
  }, [activeCategory]);

  // URL → input, e.g. when the hero search navigates here with ?q=
  useEffect(() => {
    if (urlQuery !== lastSyncedQuery.current) {
      lastSyncedQuery.current = urlQuery;
      setTerm(urlQuery);
    }
  }, [urlQuery]);

  // input → URL, debounced
  useEffect(() => {
    const next = term.trim();
    if (next === lastSyncedQuery.current) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("q", next);
      else params.delete("q");
      lastSyncedQuery.current = next;
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, URL_SYNC_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [term, pathname, router, searchParams]);

  // "/" focuses search from anywhere on the page (like GitHub, Linear, etc.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable='true']");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visibleProducts = useMemo(() => {
    const byCategory =
      activeCategory === "all" ? PRODUCTS : PRODUCTS.filter((p) => p.category === activeCategory);
    if (!query) return byCategory;
    const q = query.toLowerCase();
    return byCategory.filter(
      (p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q),
    );
  }, [activeCategory, query]);

  const qtyInCart = (id: string) => items.find((line) => line.id === id)?.qty ?? 0;

  // Card → product: the photo morphs into the product page's photo.
  const openProduct = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (isModifiedClick(e)) return; // let cmd/ctrl-click open a new tab
    const photo = e.currentTarget.closest("article")?.querySelector("img") ?? null;
    const handled = navigateWithTransition(() => router.push(`/shop/${id}`), {
      element: photo,
      name: "product-image",
    });
    if (handled) e.preventDefault();
  };

  const handleAdd = (id: string, button: HTMLElement) => {
    addItem(id);
    // Fly the card's own photo (found from the clicked card, not the document).
    const photo = button.closest("article")?.querySelector("img") ?? null;
    void flyToCart(photo, cartTargetRef.current).then(openCart);
  };

  const resultLabel = `${visibleProducts.length} product${visibleProducts.length === 1 ? "" : "s"}${
    query ? ` for “${query}”` : ""
  }`;

  return (
    <div className="shop-page cozy-page" ref={pageRef}>
      <SiteHeader />

      <section className="shop-hero">
        <span className="shop-hero__blob shop-hero__blob--1" aria-hidden="true" />
        <span className="shop-hero__blob shop-hero__blob--2" aria-hidden="true" />
        <img
          src="/assets/pets/paw-sticker.svg"
          alt=""
          aria-hidden="true"
          className="shop-hero__paw cozy-scale-in cozy-delay-300"
        />
        <span className="shop-hero__eyebrow cozy-fade-up cozy-delay-100">🐾 the good stuff</span>
        <h1 className="shop-hero__title cozy-fade-up cozy-delay-200">Everything Your Pet Loves</h1>
        <p className="shop-hero__subtitle cozy-fade-up cozy-delay-300">
          Toys, treats, cozy beds and more, picked by dogs and cats, approved by humans.
        </p>
      </section>

      <search className="shop-search cozy-fade-up cozy-delay-300">
        <label htmlFor="shop-search-input" className="visually-hidden">
          Search products
        </label>
        <input
          ref={inputRef}
          id="shop-search-input"
          type="search"
          value={term}
          placeholder="Search toys, treats, beds…"
          autoComplete="off"
          aria-describedby="shop-search-hint"
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && term) {
              e.preventDefault();
              setTerm("");
            }
          }}
        />
        <kbd id="shop-search-hint" className="shop-search__kbd" aria-label="Press slash to search">
          /
        </kbd>
      </search>

      <nav
        ref={filtersRef}
        className="shop-filters cozy-fade-up cozy-delay-400"
        aria-label="Product categories"
        data-indicator={indicator ? "" : undefined}
      >
        {/* One highlight that slides to the active pill instead of jumping. */}
        {indicator && (
          <span
            className="shop-filters__indicator"
            aria-hidden="true"
            data-animate={indicator.animate || undefined}
            style={{
              transform: `translate(${indicator.x}px, ${indicator.y}px)`,
              width: indicator.w,
              height: indicator.h,
            }}
          />
        )}
        {/* Active colours live in shop-premium.css (one navy state for every
            category) instead of per-category inline accents. */}
        {CATEGORIES.map((category) => {
          const active = category === activeCategory;
          return (
            <button
              key={category}
              ref={(node) => {
                pillRefs.current[category] = node;
              }}
              type="button"
              aria-pressed={active}
              className={`shop-filter-pill ${active ? "is-active" : ""}`}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          );
        })}
      </nav>

      <div className="shop-search-status">
        <p role="status" aria-live="polite">
          {resultLabel}
        </p>
        {term && (
          <button type="button" className="shop-search-clear" onClick={() => setTerm("")}>
            clear search
          </button>
        )}
      </div>

      {visibleProducts.length === 0 ? (
        <div className="shop-empty">
          <img src="/assets/pets/paw-sticker.svg" alt="" aria-hidden="true" />
          <h2>No products found</h2>
          <p>We couldn&apos;t sniff out anything for that search. Try another term or browse everything.</p>
          <button
            type="button"
            className="cozy-btn-orange"
            onClick={() => {
              setTerm("");
              setActiveCategory("all");
            }}
          >
            browse all products
          </button>
        </div>
      ) : (
        <section className="shop-grid" aria-label="Products" data-stale={isStale || undefined}>
          {visibleProducts.map((product) => {
            const saved = isSaved(product.id);
            const maxedOut = qtyInCart(product.id) >= product.stock;
            return (
              <article
                key={product.id}
                className="shop-card"
                data-reveal
                style={{ "--accent": CATEGORY_ACCENT[product.category] } as CSSProperties}
              >
                <Link
                  href={`/shop/${product.id}`}
                  className="shop-card__img-wrap img-slot"
                  aria-label={product.name}
                  onClick={(e) => openProduct(e, product.id)}
                >
                  <SmartImage
                    src={product.img}
                    alt=""
                    loading="lazy"
                    width={800}
                    height={800}
                    sizes="(max-width: 599px) 50vw, (max-width: 1100px) 33vw, 320px"
                  />
                  {product.badge && <span className="shop-card__badge">{product.badge}</span>}
                  <span className="shop-card__view" aria-hidden="true">
                    <IconArrowUpRight />
                  </span>
                </Link>
                <button
                  type="button"
                  className={`shop-card__fav ${saved ? "is-saved" : ""}`}
                  data-pop={popping === product.id || undefined}
                  aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
                  aria-pressed={saved}
                  onClick={() => {
                    if (!saved) pop(product.id);
                    toggleSaved(product.id);
                  }}
                >
                  <IconStar fill={saved ? "currentColor" : "none"} />
                </button>
                <div className="shop-card__info">
                  <div>
                    <Link href={`/shop/${product.id}`} className="shop-card__name" onClick={(e) => openProduct(e, product.id)}>
                      {highlight(product.name, query)}
                    </Link>
                    <p className="shop-card__category">{product.category}</p>
                  </div>
                  <p className="shop-card__price">{formatPrice(product.priceCents)}</p>
                </div>
                <button
                  type="button"
                  className="shop-card__add"
                  onClick={(e) => handleAdd(product.id, e.currentTarget)}
                  disabled={maxedOut}
                >
                  <IconPlus className="shop-card__add-icon" />{" "}
                  {maxedOut ? "all stock in cart" : "add to cart"}
                </button>
              </article>
            );
          })}
        </section>
      )}

      <SiteFooter />
    </div>
  );
}
