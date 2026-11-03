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
import { CATEGORY_ACCENT, PRODUCTS, purchasableId } from "@/lib/catalog";
import {
  SHOP_FILTERS,
  SORT_OPTIONS,
  parseSort,
  resolveFilter,
  searchText,
  sortProducts,
  type SortKey,
} from "@/lib/shop-filters";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { useScrollReveal } from "@/lib/useScrollReveal";
import { formatPrice } from "@/lib/money";
import { flyToCart } from "@/lib/fly-to-cart";
import { usePop } from "@/lib/hooks/usePop";
import { isModifiedClick, navigateWithTransition } from "@/lib/view-transition";
import type { Product } from "@/lib/types";
import SiteHeader from "@/components/SiteHeader";
import SmartImage from "@/components/SmartImage";
import SiteFooter from "@/components/SiteFooter";
import { IconPlus, IconArrowUpRight, IconStar } from "@/components/icons";

const URL_SYNC_DELAY_MS = 250;

/** Small price tag for the "today" offers pill. */
function IconTag() {
  return (
    <svg className="shop-filter-pill__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 12.2V4.5A1.5 1.5 0 0 1 4.5 3h7.7a1.5 1.5 0 0 1 1.06.44l7.3 7.3a1.5 1.5 0 0 1 0 2.12l-7.7 7.7a1.5 1.5 0 0 1-2.12 0l-7.3-7.3A1.5 1.5 0 0 1 3 12.2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" />
    </svg>
  );
}

interface ShopPageProps {
  /** Defaults to the published catalog. The admin preview passes drafts too. */
  products?: readonly Product[];
  /** Admin preview: nothing can be added to the cart or wishlist. */
  preview?: { draftIds: readonly string[]; hrefBase: string };
}

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
export default function ShopPage({ products = PRODUCTS, preview }: ShopPageProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const drafts = useMemo(() => new Set(preview?.draftIds ?? []), [preview]);
  // Preview links go to the admin's product preview, not the public page.
  const hrefFor = (id: string) => (preview ? `${preview.hrefBase}/${id}/preview` : `/shop/${id}`);

  const [term, setTerm] = useState(urlQuery);
  // Filter and sort live in the URL, so a view can be shared or bookmarked.
  const active = resolveFilter(searchParams.get("filter"), searchParams.get("category"));
  const activeKey = active.kind === "filter" ? active.filter.key : `category:${active.category}`;
  const sort = parseSort(searchParams.get("sort"));
  const replaceParams = (edit: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    edit(params);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const setFilter = (key: string) =>
    replaceParams((params) => {
      params.delete("category");
      if (key === "all") params.delete("filter");
      else params.set("filter", key);
    });
  const setSort = (key: SortKey) =>
    replaceParams((params) => (key === "relevance" ? params.delete("sort") : params.set("sort", key)));
  const deferredTerm = useDeferredValue(term);
  const query = deferredTerm.trim();
  const isStale = term.trim() !== query;

  const inputRef = useRef<HTMLInputElement>(null);
  const lastSyncedQuery = useRef(urlQuery);

  const { addItem, openCart, items, cartTargetRef } = useCart();
  const { has: isSaved, toggle: toggleSaved } = useWishlist();
  const [popping, pop] = usePop();
  const pageRef = useRef<HTMLDivElement>(null);
  useScrollReveal(pageRef, [activeKey, query, sort]);

  // Sliding filter highlight: measure the active pill (it can wrap onto a
  // new row on small screens) and move one indicator to it.
  const filtersRef = useRef<HTMLElement>(null);
  const pillRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState<{ x: number; y: number; w: number; h: number; animate: boolean } | null>(null);
  useEffect(() => {
    const container = filtersRef.current;
    if (!container) return;
    const measure = (animate: boolean) => {
      const pill = pillRefs.current[activeKey];
      if (!pill) return;
      setIndicator({ x: pill.offsetLeft, y: pill.offsetTop, w: pill.offsetWidth, h: pill.offsetHeight, animate });
    };
    measure(indicator !== null);
    // Re-measure without animating when the layout reflows (resize, font load).
    const observer = new ResizeObserver(() => measure(false));
    observer.observe(container);
    return () => observer.disconnect();
    // Only re-run when the active filter changes.
  }, [activeKey]);

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
    const filter = resolveFilter(searchParams.get("filter"), searchParams.get("category"));
    const matches = filter.kind === "filter" ? filter.filter.match : (p: Product) => p.category === filter.category;
    const q = query.toLowerCase();
    const found = products.filter((p) => matches(p) && (!q || searchText(p).includes(q)));
    return sortProducts(found, sort, query);
  }, [products, searchParams, query, sort]);

  const qtyInCart = (id: string) => items.find((line) => line.id === id)?.qty ?? 0;

  // Card → product: the photo morphs into the product page's photo.
  const openProduct = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (isModifiedClick(e)) return; // let cmd/ctrl-click open a new tab
    const photo = e.currentTarget.closest("article")?.querySelector("img") ?? null;
    const handled = navigateWithTransition(() => router.push(hrefFor(id)), {
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

  // Each empty grid explains itself: nothing published yet, no deals today, or no match.
  const empty =
    products.length === 0
      ? { title: "New products are on their way", body: "We're getting the shelves ready. Check back soon.", reset: false }
      : activeKey === "today" && !query
        ? { title: "No offers today", body: "Today's deals will show up here. Have a look at everything else in the meantime.", reset: true }
        : { title: "No products found", body: "We couldn't sniff out anything for that search. Try another term or browse everything.", reset: true };

  return (
    <div className="shop-page cozy-page" ref={pageRef}>
      <SiteHeader />

      {preview && (
        <p className="shop-preview-banner" role="note">
          <strong>Shop preview.</strong> Drafts are included and marked. Nothing here can be bought; customers only see
          published products. <Link href="/admin">Back to admin</Link>
        </p>
      )}

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
        aria-label="Product filters"
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
        {SHOP_FILTERS.map((filter) => {
          const isActive = filter.key === activeKey;
          return (
            <button
              key={filter.key}
              ref={(node) => {
                pillRefs.current[filter.key] = node;
              }}
              type="button"
              aria-pressed={isActive}
              aria-label={filter.offer ? `${filter.label}: today's offers` : undefined}
              className={`shop-filter-pill ${isActive ? "is-active" : ""} ${filter.offer ? "shop-filter-pill--offer" : ""}`}
              onClick={() => setFilter(filter.key)}
            >
              {filter.offer && <IconTag />}
              {filter.label}
              {filter.offer && (
                <span className="shop-filter-pill__tag" aria-hidden="true">
                  offer
                </span>
              )}
            </button>
          );
        })}
        {active.kind === "category" && (
          <button
            ref={(node) => {
              pillRefs.current[activeKey] = node;
            }}
            type="button"
            aria-pressed="true"
            className="shop-filter-pill is-active"
            onClick={() => setFilter("all")}
            aria-label={`${active.category}: remove filter`}
          >
            {active.category} <span aria-hidden="true">×</span>
          </button>
        )}
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
        <label className="shop-sort">
          <span>sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visibleProducts.length === 0 ? (
        <div className="shop-empty">
          <img src="/assets/pets/paw-sticker.svg" alt="" aria-hidden="true" />
          <h2>{empty.title}</h2>
          <p>{empty.body}</p>
          {empty.reset && (
            <button
              type="button"
              className="cozy-btn-orange"
              onClick={() => {
                setTerm("");
                setFilter("all");
              }}
            >
              browse all products
            </button>
          )}
        </div>
      ) : (
        <section className="shop-grid" aria-label="Products" data-stale={isStale || undefined}>
          {visibleProducts.map((product) => {
            const saved = isSaved(product.id);
            // With pack sizes, the card adds the first pack in stock (e.g. 70 g).
            const pack = product.variants?.find((v) => v.sku === purchasableId(product));
            const addId = pack?.sku ?? product.id;
            const maxedOut = pack ? qtyInCart(pack.sku) >= pack.stock : !product.variants?.length && qtyInCart(product.id) >= product.stock;
            const soldOut = Boolean(product.variants?.length) && !pack;
            const discount =
              product.compareAtCents && product.compareAtCents > product.priceCents
                ? Math.round((1 - product.priceCents / product.compareAtCents) * 100)
                : 0;
            const isDraft = drafts.has(product.id);
            const href = hrefFor(product.id);
            return (
              <article
                key={product.id}
                className="shop-card"
                data-reveal
                style={{ "--accent": CATEGORY_ACCENT[product.category] } as CSSProperties}
              >
                <Link
                  href={href}
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
                  {isDraft ? (
                    <span className="shop-card__badge shop-card__badge--draft">draft</span>
                  ) : (
                    product.badge && <span className="shop-card__badge">{product.badge}</span>
                  )}
                  <span className="shop-card__view" aria-hidden="true">
                    <IconArrowUpRight />
                  </span>
                </Link>
                {!preview && (
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
                )}
                <div className="shop-card__info">
                  <div>
                    <Link href={href} className="shop-card__name" onClick={(e) => openProduct(e, product.id)}>
                      {highlight(product.name, query)}
                    </Link>
                    <p className="shop-card__category">{product.subcategory ?? product.category}</p>
                  </div>
                  <p className="shop-card__price">
                    {product.comingSoon ? (
                      <span className="shop-card__soon">price coming soon</span>
                    ) : isDraft && product.priceCents === 0 ? (
                      <span className="shop-card__no-price">no price yet</span>
                    ) : (
                      <>
                        {product.compareAtCents && (
                          <s className="shop-card__was">
                            <span className="visually-hidden">was </span>
                            {formatPrice(product.compareAtCents)}
                          </s>
                        )}
                        {product.variants && product.variants.length > 1 && <span className="shop-card__from">from </span>}
                        {formatPrice(product.priceCents)}
                        {discount > 0 && <span className="shop-card__off">{discount}% off</span>}
                      </>
                    )}
                  </p>
                </div>
                {preview ? (
                  <button type="button" className="shop-card__add" disabled>
                    {isDraft ? "draft · not for sale" : "preview only"}
                  </button>
                ) : product.comingSoon ? (
                  <button type="button" className="shop-card__add shop-card__add--soon" disabled>
                    coming soon
                  </button>
                ) : (
                  <button
                    type="button"
                    className="shop-card__add"
                    onClick={(e) => handleAdd(addId, e.currentTarget)}
                    disabled={maxedOut || soldOut}
                    aria-label={pack ? `Add ${product.name}, ${pack.label}, to cart` : undefined}
                  >
                    <IconPlus className="shop-card__add-icon" />{" "}
                    {soldOut ? "sold out" : maxedOut ? "all stock in cart" : pack ? `add ${pack.label}` : "add to cart"}
                  </button>
                )}
              </article>
            );
          })}
        </section>
      )}

      <SiteFooter />
    </div>
  );
}
