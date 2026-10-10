"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { getProduct } from "@/lib/catalog";
import { deliveryWindow } from "@/lib/delivery";
import { readLastOrder, type PlacedOrder } from "@/lib/last-order";
import { formatPrice } from "@/lib/money";
import { NETWORK_FEE_CENTS, shortAddress } from "@/lib/wallet-machine";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import CheckoutSteps from "@/components/CheckoutSteps";
import SmartImage from "@/components/SmartImage";
import { IconArrowRight, IconCheck, IconTruck } from "@/components/icons";

type Loaded = { state: "loading" } | { state: "missing" } | { state: "ready"; order: PlacedOrder };

const NEXT_STEPS = [
  { title: "we're packing it", body: "a real human (and a supervising cat) packs your order today." },
  { title: "it ships", body: "you'll get a tracking link by email as soon as it leaves us." },
  { title: "tail wags", body: "it arrives in 2–4 working days. free returns for 30 days." },
];

export default function OrderConfirmation() {
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [copied, setCopied] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const order = readLastOrder();
    setLoaded(order ? { state: "ready", order } : { state: "missing" });
  }, []);

  // Move focus to the heading so screen readers announce the result of checkout.
  useEffect(() => {
    if (loaded.state !== "loading") headingRef.current?.focus();
  }, [loaded.state]);

  const copyOrderId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the ID is still selectable text */
    }
  };

  return (
    <div className="cozy-page cart-page">
      <SiteHeader />

      <section className="order-confirm" aria-busy={loaded.state === "loading"}>
        {loaded.state === "loading" && <div className="order-confirm__loading" />}

        {loaded.state === "missing" && (
          <div className="cart-empty">
            <img src="/assets/pets/paw-sticker.svg" alt="" aria-hidden="true" />
            <h1 ref={headingRef} tabIndex={-1}>
              no recent order here
            </h1>
            <p>Receipts only stay in this tab. If you placed an order, check your email.</p>
            <Link href="/shop" className="cozy-btn-orange">
              browse the shop <IconArrowRight className="cozy-btn-orange__icon" />
            </Link>
          </div>
        )}

        {loaded.state === "ready" && (
          <Receipt order={loaded.order} headingRef={headingRef} copied={copied} onCopy={copyOrderId} />
        )}
      </section>

      <SiteFooter />
    </div>
  );
}

function Receipt({
  order,
  headingRef,
  copied,
  onCopy,
}: {
  order: PlacedOrder;
  headingRef: RefObject<HTMLHeadingElement | null>;
  copied: boolean;
  onCopy: (id: string) => void;
}) {
  const { quote, customer } = order;
  const firstName = customer.name.trim().split(/\s+/)[0] ?? "";
  const arrives = deliveryWindow(new Date(order.placedAt));

  return (
    <>
      <CheckoutSteps current="done" />

      <header className="order-confirm__hero">
        <span className="order-confirm__check" aria-hidden="true">
          <IconCheck />
        </span>
        <h1 ref={headingRef} tabIndex={-1}>
          Thank you{firstName ? `, ${firstName}` : ""}! 🐾
        </h1>
        <p className="order-confirm__lead">
          Your order is confirmed. A (pretend) receipt is on its way to <strong>{customer.email}</strong>.
        </p>
        <div className="order-confirm__id">
          <span>order</span>
          <code>{order.orderId}</code>
          <button type="button" className="order-confirm__copy" onClick={() => onCopy(order.orderId)}>
            {copied ? "copied ✓" : "copy"}
          </button>
          <span className="visually-hidden" role="status" aria-live="polite">
            {copied ? "Order number copied" : ""}
          </span>
        </div>
      </header>

      <div className="order-confirm__grid">
        <section className="order-card" aria-labelledby="receipt-title">
          <h2 id="receipt-title">what you ordered</h2>
          <ul className="order-lines">
            {quote.lines.map((line) => {
              const product = getProduct(line.id);
              return (
                <li key={line.id} className="order-line">
                  {product && <SmartImage src={product.img} alt="" width={56} height={56} sizes="56px" />}
                  <div className="order-line__text">
                    <p className="order-line__name">{line.name}</p>
                    <p className="order-line__meta">
                      {line.qty} × {formatPrice(line.unitCents)}
                    </p>
                  </div>
                  <p className="order-line__total">{formatPrice(line.lineCents)}</p>
                </li>
              );
            })}
          </ul>
          <dl className="order-totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatPrice(quote.subtotalCents)}</dd>
            </div>
            <div>
              <dt>Shipping</dt>
              <dd>{quote.shippingCents === 0 ? "Free" : formatPrice(quote.shippingCents)}</dd>
            </div>
            <div className="order-totals__total">
              <dt>Total paid</dt>
              <dd>{formatPrice(quote.totalCents)}</dd>
            </div>
          </dl>
          <p className="order-paid-with">
            {order.payment?.method === "wallet" ? (
              <>
                paid with wallet <code>{shortAddress(order.payment.account)}</code> · tx{" "}
                <code>{shortAddress(order.payment.txHash)}</code>{" "}
                <span className="wallet-sim-badge">simulated</span>
                <br />
                plus a {formatPrice(NETWORK_FEE_CENTS)} network fee, paid from your wallet
              </>
            ) : (
              <>paid by card (demo: nothing was charged)</>
            )}
          </p>
        </section>

        <div className="order-confirm__side">
          <section className="order-card" aria-labelledby="delivery-title">
            <h2 id="delivery-title">
              <IconTruck /> arriving {arrives}
            </h2>
            <address className="order-address">
              {customer.name}
              <br />
              {customer.address}
              <br />
              {customer.city} {customer.zip}
            </address>
          </section>

          <section className="order-card" aria-labelledby="next-title">
            <h2 id="next-title">what happens next</h2>
            <ol className="order-next">
              {NEXT_STEPS.map((step, i) => (
                <li key={step.title} data-active={i === 0 || undefined}>
                  <p className="order-next__title">{step.title}</p>
                  <p className="order-next__body">{step.body}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <div className="order-confirm__actions">
        <Link href="/shop" className="cozy-btn-orange">
          keep shopping <IconArrowRight className="cozy-btn-orange__icon" />
        </Link>
        <p className="cart-summary__note">demo store: no real payment was taken and no email is sent.</p>
      </div>
    </>
  );
}
