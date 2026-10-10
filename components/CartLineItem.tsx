"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import Link from "next/link";
import { useCart } from "@/lib/cart";
import { useDelayedFlag } from "@/lib/hooks/useDelayedFlag";
import { formatPrice } from "@/lib/money";
import type { Product } from "@/lib/types";
import SmartImage from "@/components/SmartImage";
import QtyNumber from "@/components/QtyNumber";
import { IconClose, IconMinus, IconPlus } from "@/components/icons";

interface Props {
  product: Product;
  qty: number;
  variant: "drawer" | "page";
  /** Server-quoted unit price, when it differs from the catalog. */
  unitCents?: number;
  onNavigate?: () => void;
  /** Briefly highlight this row (it was just added). */
  highlight?: boolean;
  /** The row was removed and is animating out (see useExitingItems). */
  exiting?: boolean;
}

/** Collapse a removed row: slide + fade, then close the gap it leaves. */
function collapse(el: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: "forwards" });
    return;
  }
  const cs = getComputedStyle(el);
  el.style.overflow = "hidden";
  el.animate(
    [
      { opacity: 1, transform: "none", height: `${el.offsetHeight}px`, paddingBlock: `${cs.paddingTop} ${cs.paddingBottom}`, marginBlock: `${cs.marginTop} ${cs.marginBottom}` },
      { opacity: 0, transform: "translateX(24px)", height: `${el.offsetHeight}px`, offset: 0.45 },
      { opacity: 0, transform: "translateX(24px)", height: "0px", paddingBlock: "0px", marginBlock: "0px", borderWidth: "0px" },
    ],
    { duration: 300, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" },
  );
}

/** One cart row, shared by the drawer and the cart page. */
export default function CartLineItem({ product, qty, variant, unitCents, onNavigate, highlight, exiting }: Props) {
  const rowRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (highlight) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [highlight]);
  useLayoutEffect(() => {
    if (exiting && rowRef.current) collapse(rowRef.current);
  }, [exiting]);
  const unit = unitCents ?? product.priceCents;
  const { setQty, removeItem, isPending, lineNote } = useCart();
  const note = exiting ? undefined : lineNote(product.id);
  // Only show "saving" if the server is slow: no flicker on fast networks.
  const showPending = useDelayedFlag(isPending(product.id), 300);
  const atStock = qty >= product.stock;

  const stepper = (
    <div className="shop-cart__qty" data-pending={showPending || undefined}>
      <button
        type="button"
        aria-label={`Decrease quantity of ${product.name}`}
        onClick={() => setQty(product.id, qty - 1)}
      >
        <IconMinus />
      </button>
      <QtyNumber value={qty} />
      <button
        type="button"
        aria-label={`Increase quantity of ${product.name}`}
        disabled={atStock}
        onClick={() => setQty(product.id, qty + 1)}
      >
        <IconPlus />
      </button>
    </div>
  );

  // A server correction wins over everything else: it's the "why did my
  // number just change?" answer, right where the number is.
  const status = note ? (
    <span key={note.key} className="cart-line__status cart-line__note" data-tone={note.tone}>
      {note.text}
    </span>
  ) : showPending ? (
    <span className="cart-line__status" role="status">saving…</span>
  ) : atStock ? (
    <span className="cart-line__status">max available</span>
  ) : null;

  if (variant === "drawer") {
    return (
      <li
        ref={rowRef}
        className="shop-cart__line"
        data-pending={showPending || undefined}
        data-note={note?.tone}
        data-exiting={exiting || undefined}
        inert={exiting || undefined}
        aria-hidden={exiting || undefined}
        data-just-added={highlight || undefined}
      >
        <SmartImage src={product.img} alt="" width={96} height={96} sizes="96px" />
        <div className="shop-cart__line-info">
          <p className="shop-cart__line-name">{product.name}</p>
          <p className="shop-cart__line-price">{formatPrice(unit)}</p>
          <div className="cart-line__controls">
            {stepper}
            {status}
          </div>
        </div>
        <button
          type="button"
          className="shop-cart__remove"
          aria-label={`Remove ${product.name}`}
          onClick={() => removeItem(product.id)}
        >
          <IconClose />
        </button>
      </li>
    );
  }

  return (
    <li
      ref={rowRef}
      className="cart-line"
      data-pending={showPending || undefined}
      data-note={note?.tone}
      data-exiting={exiting || undefined}
      inert={exiting || undefined}
      aria-hidden={exiting || undefined}
    >
      <Link href={`/shop/${product.id}`} className="cart-line__img img-slot" onClick={onNavigate} tabIndex={-1} aria-hidden="true">
        <SmartImage src={product.img} alt="" width={96} height={96} sizes="96px" />
      </Link>
      <div className="cart-line__body">
        <div className="cart-line__top">
          <div>
            <Link href={`/shop/${product.id}`} className="cart-line__name">
              {product.name}
            </Link>
            <p className="cart-line__category">{product.category}</p>
          </div>
          <button
            type="button"
            className="cart-line__remove"
            aria-label={`Remove ${product.name}`}
            onClick={() => removeItem(product.id)}
          >
            <IconClose />
          </button>
        </div>
        <div className="cart-line__bottom">
          <div className="cart-line__controls">
            {stepper}
            {status}
          </div>
          <p className="cart-line__price">{formatPrice(unit * qty)}</p>
        </div>
      </div>
    </li>
  );
}
