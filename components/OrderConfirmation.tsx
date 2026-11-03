"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { getProduct } from "@/lib/catalog";
import { markWhatsappOpened, readLastOrder, type PlacedOrder } from "@/lib/last-order";
import { formatPrice } from "@/lib/money";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-types";
import { PAYMENT_OPTIONS } from "@/lib/payment-methods";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import CheckoutSteps from "@/components/CheckoutSteps";
import SmartImage from "@/components/SmartImage";
import { IconArrowRight, IconCheck, IconTruck } from "@/components/icons";

type Loaded = { state: "loading" } | { state: "missing" } | { state: "ready"; order: PlacedOrder };

const NEXT_STEPS = [
  { title: "send your order on WhatsApp", body: "send the pre-filled message. Your order is only confirmed once our team has it." },
  { title: "we confirm with you", body: "our team replies on WhatsApp to confirm your order and arrange payment." },
  { title: "we pack and ship", body: "once payment is arranged, your order is packed and sent to your delivery address." },
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
            <p>
              This page only remembers your latest order while this tab is open. If you placed an order, our team will
              reply to you on WhatsApp.
            </p>
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
  const method = PAYMENT_OPTIONS.find((o) => o.id === order.paymentMethod);
  // Local copy of "opened" so the note updates the moment the button is used.
  const [opened, setOpened] = useState(order.whatsappOpened);

  return (
    <>
      <CheckoutSteps current="done" />

      <header className="order-confirm__hero">
        <span className="order-confirm__check" aria-hidden="true">
          <IconCheck />
        </span>
        <h1 ref={headingRef} tabIndex={-1}>
          Your order is recorded{firstName ? `, ${firstName}` : ""}! 🐾
        </h1>
        <p className="order-confirm__lead">
          Your order has been recorded. <strong>Please send the pre-filled WhatsApp message to confirm your order.</strong>{" "}
          Our team will contact you regarding payment and delivery.
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

      <section className="order-whatsapp" aria-labelledby="whatsapp-title">
        <h2 id="whatsapp-title">send your order on WhatsApp</h2>
        <a
          className="order-whatsapp__btn"
          href={order.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            markWhatsappOpened();
            setOpened(true);
          }}
        >
          {opened ? "open WhatsApp again" : "open WhatsApp"} <IconArrowRight className="cozy-btn-orange__icon" />
        </a>
        <p className="order-whatsapp__note" role="status">
          {opened
            ? "We tried to open WhatsApp in a new tab. Opening it doesn't send anything: please check that you pressed send. If it didn't open, use the button above."
            : "Your browser didn't open WhatsApp automatically. Use the button above to open it with your order filled in."}
        </p>
        <p className="order-whatsapp__note">
          Your order is not confirmed until our team receives your message and replies. Nothing has been charged.
        </p>
      </section>

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
              <dt>Delivery</dt>
              <dd>{quote.shippingCents === 0 ? "Free" : formatPrice(quote.shippingCents)}</dd>
            </div>
            <div className="order-totals__total">
              <dt>Total to pay</dt>
              <dd>{formatPrice(quote.totalCents)}</dd>
            </div>
          </dl>
          <dl className="order-status">
            <div>
              <dt>Order status</dt>
              <dd data-tone="pending">{ORDER_STATUS_LABEL[order.status]}</dd>
            </div>
            <div>
              <dt>Payment status</dt>
              <dd data-tone="pending">{PAYMENT_STATUS_LABEL[order.paymentStatus]}</dd>
            </div>
            <div>
              <dt>Payment method</dt>
              <dd>{method?.receiptLabel ?? order.paymentMethod}: pay as arranged</dd>
            </div>
          </dl>
        </section>

        <div className="order-confirm__side">
          <section className="order-card" aria-labelledby="delivery-title">
            <h2 id="delivery-title">
              <IconTruck /> delivering to
            </h2>
            <address className="order-address">
              {customer.name}
              <br />
              {customer.address}
              <br />
              {customer.city}, {customer.state} {customer.pin}
              <br />
              +91 {customer.phone.slice(0, 5)} {customer.phone.slice(5)}
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
      </div>
    </>
  );
}
