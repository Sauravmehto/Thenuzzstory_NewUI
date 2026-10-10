"use client";

import { useRef } from "react";
import Link from "next/link";
import { getProduct } from "@/lib/catalog";
import { formatPrice } from "@/lib/money";
import { useDialog } from "@/lib/hooks/useDialog";
import { useWishlist } from "@/lib/wishlist";
import { useCart } from "@/lib/cart";
import { IconClose, IconStar, IconPlus } from "@/components/icons";

export default function WishlistDrawer() {
  const { ids, remove, isOpen, closeWishlist } = useWishlist();
  const { addItem, openCart } = useCart();

  const dialogRef = useRef(null);
  useDialog(dialogRef, isOpen, closeWishlist);

  const items = ids.map(getProduct).filter(Boolean);

  const moveToCart = (id) => {
    addItem(id);
    remove(id);
    closeWishlist();
    openCart();
  };

  return (
    <div className="drawer-root">
      <div
        className={`shop-cart-backdrop ${isOpen ? "is-open" : ""}`}
        onClick={closeWishlist}
        aria-hidden="true"
      />
      <aside
        ref={dialogRef}
        className={`shop-cart ${isOpen ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wishlist-drawer-title"
        tabIndex={-1}
        inert={!isOpen}
      >
        <div className="shop-cart__head">
          <h2 id="wishlist-drawer-title" className="shop-cart__title">your wishlist</h2>
          <button
            className="cozy-icon-btn"
            aria-label="Close wishlist"
            onClick={closeWishlist}
          >
            <IconClose className="cozy-icon" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="shop-cart__empty">
            <IconStar className="wl-empty-star" />
            <p>No favorites yet — tap the star on a product to save it.</p>
            <Link
              href="/shop"
              className="cozy-btn-orange"
              onClick={closeWishlist}
            >
              browse products
            </Link>
          </div>
        ) : (
          <ul className="shop-cart__list">
            {items.map((item) => (
              <li key={item.id} className="shop-cart__line">
                <Link
                  href={`/shop/${item.id}`}
                  onClick={closeWishlist}
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <img src={item.img} alt="" width={72} height={72} />
                </Link>
                <div className="shop-cart__line-info">
                  <Link
                    href={`/shop/${item.id}`}
                    className="shop-cart__line-name"
                    onClick={closeWishlist}
                  >
                    {item.name}
                  </Link>
                  <p className="shop-cart__line-price">
                    {formatPrice(item.priceCents)}
                  </p>
                  <button
                    className="wl-move-btn"
                    onClick={() => moveToCart(item.id)}
                  >
                    <IconPlus /> add to cart
                  </button>
                </div>
                <button
                  className="shop-cart__remove"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => remove(item.id)}
                >
                  <IconClose />
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
