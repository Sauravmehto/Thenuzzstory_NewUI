import SiteHeader from "@/components/SiteHeader";

/* Shape-matching placeholders for route loading states. They mirror the real
   layouts so nothing jumps when content arrives. Decorative, so hidden from
   assistive tech; each wrapper announces "loading" once via aria-busy. */

const Bar = ({ w, h = 14, className = "" }: { w: string; h?: number; className?: string }) => (
  <span className={`skeleton ${className}`} style={{ width: w, height: h }} aria-hidden="true" />
);

export function ShopSkeleton() {
  return (
    <div className="shop-page cozy-page" aria-busy="true" aria-label="Loading products">
      <SiteHeader />
      <div className="skeleton-hero">
        <Bar w="min(520px, 80%)" h={56} />
        <Bar w="min(380px, 60%)" h={18} />
        <Bar w="min(560px, 90%)" h={50} className="skeleton--pill" />
      </div>
      <div className="shop-grid">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="skeleton-card" aria-hidden="true">
            <span className="skeleton skeleton-card__img" />
            <Bar w="70%" />
            <Bar w="40%" h={12} />
            <Bar w="100%" h={40} className="skeleton--pill" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductSkeleton() {
  return (
    <div className="cozy-page product-page" aria-busy="true" aria-label="Loading product">
      <SiteHeader />
      <div className="product-main skeleton-product">
        <span className="skeleton skeleton-product__img" aria-hidden="true" />
        <div className="skeleton-product__info" aria-hidden="true">
          <Bar w="120px" h={24} className="skeleton--pill" />
          <Bar w="80%" h={52} />
          <Bar w="30%" h={32} />
          <Bar w="100%" />
          <Bar w="90%" />
          <Bar w="100%" h={48} className="skeleton--pill" />
        </div>
      </div>
    </div>
  );
}

export function CartRowsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <ul className="cart-lines" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="cart-line skeleton-row">
          <span className="skeleton skeleton-row__img" />
          <span className="skeleton-row__text">
            <Bar w="60%" h={16} />
            <Bar w="35%" h={12} />
            <Bar w="110px" h={32} className="skeleton--pill" />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CheckoutSkeleton() {
  return (
    <div className="cozy-page cart-page" aria-busy="true" aria-label="Loading checkout">
      <SiteHeader />
      <section className="cart-main">
        <Bar w="220px" h={48} />
        <div className="cart-layout" style={{ marginTop: "2rem" }}>
          <div className="cart-left">
            <CartRowsSkeleton />
          </div>
          <div className="cart-summary" aria-hidden="true">
            <Bar w="60%" h={24} />
            <Bar w="100%" />
            <Bar w="100%" />
            <Bar w="100%" h={46} className="skeleton--pill" />
          </div>
        </div>
      </section>
    </div>
  );
}
