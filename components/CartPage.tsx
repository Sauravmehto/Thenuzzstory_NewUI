"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import { getProduct } from "@/lib/catalog";
import { saveLastOrder } from "@/lib/last-order";
import { formatPrice } from "@/lib/money";
import { buildQuote, FREE_SHIPPING_THRESHOLD_CENTS } from "@/lib/pricing";
import { DEFAULT_PAYMENT_METHOD, PAYMENT_OPTIONS } from "@/lib/payment-methods";
import {
  CUSTOMER_FIELDS,
  INDIAN_STATES,
  cleanCustomer,
  validateCustomer,
  validateField,
  type CustomerField,
} from "@/lib/validation";
import type {
  CartLine,
  CheckoutCustomer,
  LineChange,
  OrderRequest,
  OrderResponse,
  PaymentMethod,
  Quote,
} from "@/lib/types";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import CartLineItem from "@/components/CartLineItem";
import CheckoutSteps from "@/components/CheckoutSteps";
import { CheckoutSkeleton } from "@/components/Skeletons";
import AnimatedPrice from "@/components/AnimatedPrice";
import { prefersReducedMotion } from "@/lib/motion";
import { useBump } from "@/lib/hooks/useBump";
import { useExitingItems } from "@/lib/hooks/useExitingItems";
import { IconArrowRight, IconCheck, IconTruck } from "@/components/icons";

type FieldErrors = Partial<Record<CustomerField | "items" | "form", string>>;

interface FieldConfig {
  name: CustomerField;
  label: string;
  span: 1 | 2;
  autoComplete: string;
  kind: "text" | "email" | "tel" | "textarea" | "select";
  inputMode?: "email" | "text" | "tel" | "numeric";
  maxLength?: number;
  /** HTML pattern: the same shape the JavaScript and server checks accept. */
  pattern?: string;
  hint?: string;
}

// No example values as placeholders: grey "Jane Doe" text reads like a
// filled-in field and people skip it. Labels + a hint where it helps.
// Every field is required (HTML `required` + the checks in lib/validation.ts).
const FIELDS: FieldConfig[] = [
  { name: "name", label: "Full name", span: 2, autoComplete: "name", kind: "text", maxLength: 80 },
  {
    name: "phone",
    label: "Mobile number",
    span: 1,
    autoComplete: "tel-national",
    kind: "tel",
    inputMode: "tel",
    maxLength: 16,
    // "\-" not "-": browsers compile `pattern` with the `v` flag, where a bare "-" in [...] is invalid.
    pattern: "(?:\\+?91[\\s\\-]?|0)?[6-9][0-9]{4}[\\s\\-]?[0-9]{5}",
    hint: "10 digits; we'll call or WhatsApp you on this",
  },
  {
    name: "email",
    label: "Email address",
    span: 1,
    autoComplete: "email",
    kind: "email",
    inputMode: "email",
    maxLength: 254,
  },
  {
    name: "address",
    label: "Complete delivery address",
    span: 2,
    autoComplete: "street-address",
    kind: "textarea",
    maxLength: 300,
    hint: "house or flat number, street, area, landmark",
  },
  { name: "city", label: "City", span: 1, autoComplete: "address-level2", kind: "text", maxLength: 60 },
  {
    name: "pin",
    label: "PIN code",
    span: 1,
    autoComplete: "postal-code",
    kind: "text",
    inputMode: "numeric",
    maxLength: 7,
    pattern: "[1-9][0-9]{5}",
  },
  { name: "state", label: "State", span: 2, autoComplete: "address-level1", kind: "select" },
];

type Status = "idle" | "placing" | "review" | "success";

/**
 * Stable signature of an order attempt: the cart, the total AND the details. A
 * retry of the very same order reuses its key (so it can never create a second
 * order); changing anything, even the address, starts a new attempt.
 */
const signature = (q: Quote, c: CheckoutCustomer) =>
  q.lines.map((l) => `${l.id}:${l.qty}:${l.unitCents}`).join("|") + `=${q.totalCents}#${JSON.stringify(cleanCustomer(c))}`;

const sameLines = (a: readonly CartLine[], b: readonly CartLine[]) =>
  a.length === b.length && a.every((l, i) => l.id === b[i]?.id && l.qty === b[i]?.qty);

function describeChange(change: LineChange): string {
  switch (change.kind) {
    case "price":
      return `${change.name}: ${formatPrice(change.fromCents)} → ${formatPrice(change.toCents)}`;
    case "qty":
      return `${change.name}: only ${change.toQty} available (you had ${change.fromQty})`;
    case "removed":
      return `${change.name}: no longer available, removed`;
  }
}

const emptyCustomer: CheckoutCustomer = { name: "", phone: "", email: "", address: "", city: "", state: "", pin: "" };

export default function CartPage() {
  const router = useRouter();
  const { items, hydrated, clearCart, replaceLines } = useCart();
  const renderedLines = useExitingItems(items, (line) => line.id);
  const [status, setStatus] = useState<Status>("idle");
  const [values, setValues] = useState<CheckoutCustomer>(emptyCustomer);
  const [touched, setTouched] = useState<Partial<Record<CustomerField, boolean>>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [announcement, setAnnouncement] = useState("");
  const [serverQuote, setServerQuote] = useState<Quote | null>(null);
  const [changes, setChanges] = useState<LineChange[]>([]);
  const [payMethod, setPayMethod] = useState<PaymentMethod>(DEFAULT_PAYMENT_METHOD);
  // Bumped on every failed attempt so the button's "shake" animation replays.
  const [shakeKey, setShakeKey] = useState(0);
  const placeOrderRef = useRef<HTMLButtonElement>(null);
  // A small "no" shake on failure. Motion only: the reason is always in text too.
  useEffect(() => {
    if (shakeKey === 0 || prefersReducedMotion()) return;
    placeOrderRef.current?.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-6px)" },
        { transform: "translateX(5px)" },
        { transform: "translateX(-3px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 380, easing: "ease-out" },
    );
  }, [shakeKey]);

  const formRef = useRef<HTMLFormElement>(null);
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const summaryButtonRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const idempotency = useRef<{ sig: string; key: string } | null>(null);
  const confirmed = useRef(false);
  const [summaryButtonVisible, setSummaryButtonVisible] = useState(true);

  // The quote the customer is looking at. If the server has priced this exact
  // cart, show the server's numbers; otherwise the catalog's.
  const quote = useMemo<Quote>(() => {
    if (serverQuote && sameLines(serverQuote.lines, items)) return serverQuote;
    return buildQuote(items, getProduct);
  }, [items, serverQuote]);

  // Editing the cart after a review invalidates the review.
  useEffect(() => {
    if (status === "review" && serverQuote && !sameLines(serverQuote.lines, items)) {
      setStatus("idle");
      setChanges([]);
    }
  }, [items, serverQuote, status]);

  useEffect(() => {
    if (status === "review") reviewHeadingRef.current?.focus();
  }, [status]);

  // Mobile: the summary sits below the form, so a slim bar keeps
  // "place order" in reach until the real button scrolls into view.
  useEffect(() => {
    const target = summaryButtonRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setSummaryButtonVisible(entry.isIntersecting);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hydrated, quote.lines.length]);

  const unitFor = (id: string) => quote.lines.find((l) => l.id === id)?.unitCents;
  const remainingForFree = Math.max(0, FREE_SHIPPING_THRESHOLD_CENTS - quote.subtotalCents);
  const freeDeliveryBump = useBump(remainingForFree === 0 && quote.lines.length > 0 ? 1 : 0, hydrated);

  /*
   * Validation timing ("reward early, punish late"):
   * - no errors while someone is still typing their first attempt,
   * - check a field when they leave it,
   * - once a field has been checked, re-check on every keystroke so the
   *   error disappears the moment it's fixed.
   */
  const onFieldChange = (field: CustomerField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    if (touched[field]) setErrors((e) => ({ ...e, [field]: validateField(field, value) }));
  };

  const onFieldBlur = (field: CustomerField) => {
    if (!values[field]) return; // leaving an empty field untouched isn't an error yet
    setTouched((t) => ({ ...t, [field]: true }));
    setErrors((e) => ({ ...e, [field]: validateField(field, values[field]) }));
  };

  function focusField(field: CustomerField) {
    const el = formRef.current?.elements.namedItem(field);
    if (el instanceof HTMLElement) el.focus();
  }

  /** Client-side check first: no round trip to find a typo. Returns true when the form is good. */
  function checkForm(): boolean {
    const clientErrors = validateCustomer(values);
    const invalid = CUSTOMER_FIELDS.filter((f) => clientErrors[f]);
    if (invalid.length === 0) return true;
    setErrors(clientErrors);
    setTouched(Object.fromEntries(CUSTOMER_FIELDS.map((f) => [f, true])));
    setAnnouncement(`${invalid.length} field${invalid.length === 1 ? " needs" : "s need"} a look before we can place your order.`);
    setShakeKey((k) => k + 1);
    focusField(invalid[0]!);
    return false;
  }

  /**
   * Save the order on the server, then open WhatsApp. The cart is only cleared
   * (and WhatsApp only opened) after the server confirms the order was saved.
   */
  async function submitOrder(expected: Quote) {
    if (inFlight.current || confirmed.current) return; // blocks double-clicks within the same frame
    if (!checkForm()) return;

    inFlight.current = true;
    setStatus("placing");
    setErrors({});
    setAnnouncement("");

    // Same order intent → same key, so a retry can never create a second order.
    const sig = signature(expected, values);
    if (idempotency.current?.sig !== sig) {
      idempotency.current = { sig, key: crypto.randomUUID() };
    }

    const body: OrderRequest = {
      customer: cleanCustomer(values),
      items: expected.lines.map(({ id, qty }) => ({ id, qty })),
      expected: { lines: expected.lines, totalCents: expected.totalCents },
      paymentMethod: payMethod,
    };

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotency.current.key,
        },
        body: JSON.stringify(body),
      });
      const result = (await res.json().catch(() => null)) as OrderResponse | null;
      if (!result) {
        setErrors({ form: `Something went wrong on our side (error ${res.status}). Your order was not placed and your cart is safe. Please try again.` });
        setShakeKey((k) => k + 1);
        setStatus("idle");
        return;
      }

      if (result.ok) {
        confirmed.current = true;
        // Try to open WhatsApp in a new tab. If the browser blocks it, the
        // confirmation page has a button that does the same thing.
        let opened = false;
        try {
          const tab = window.open(result.whatsappUrl, "_blank");
          if (tab) {
            tab.opener = null;
            opened = true;
          }
        } catch {
          /* blocked: handled by the button on the confirmation page */
        }
        saveLastOrder({
          orderId: result.orderId,
          placedAt: result.placedAt,
          quote: result.quote,
          customer: cleanCustomer(values),
          paymentMethod: result.paymentMethod,
          status: result.status,
          paymentStatus: result.paymentStatus,
          whatsappUrl: result.whatsappUrl,
          whatsappOpened: opened,
        });
        // A short "order saved ✓" beat on the button before we move on,
        // so success registers where the user is looking.
        setStatus("success");
        window.setTimeout(
          () => {
            clearCart();
            // replace(), not push(): "back" from the receipt shouldn't land on a checkout form.
            router.replace("/order/confirmed");
          },
          prefersReducedMotion() ? 250 : 750,
        );
        return;
      }

      switch (result.code) {
        case "validation": {
          setErrors(result.errors);
          setShakeKey((k) => k + 1);
          setStatus("idle");
          const first = CUSTOMER_FIELDS.find((f) => result.errors[f]);
          if (first) focusField(first);
          break;
        }
        case "quote_changed":
          setServerQuote(result.quote);
          setChanges(result.changes);
          replaceLines(result.quote.lines.map(({ id, qty }) => ({ id, qty })));
          setStatus("review");
          break;
        default:
          setErrors({ form: result.message });
          setShakeKey((k) => k + 1);
          setStatus("idle");
      }
    } catch {
      setErrors({ form: "We couldn't reach the store, so your order was not placed. Your cart is safe: check your connection and try again." });
      setShakeKey((k) => k + 1);
      setStatus("idle");
    } finally {
      inFlight.current = false;
    }
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void submitOrder(quote);
  };

  // The saved cart lives in the browser, so the server can't render it.
  // Show the page's shape until it's read instead of flashing "$0.00".
  if (!hydrated) return <CheckoutSkeleton />;

  if (hydrated && quote.lines.length === 0) {
    return (
      <div className="cozy-page cart-page">
        <SiteHeader />
        <section className="cart-empty">
          <img src="/assets/pets/paw-sticker.svg" alt="" aria-hidden="true" />
          <h1>Your cart is empty</h1>
          <p>Let&apos;s find something your pet will love.</p>
          <Link href="/shop" className="cozy-btn-orange">
            start shopping <IconArrowRight className="cozy-btn-orange__icon" />
          </Link>
        </section>
        <SiteFooter />
      </div>
    );
  }

  const placing = status === "placing";
  const succeeded = status === "success";
  const busy = placing || succeeded;
  const itemCount = quote.lines.reduce((n, l) => n + l.qty, 0);

  return (
    <div className="cozy-page cart-page">
      <SiteHeader />

      <section className="cart-main" aria-busy={!hydrated}>
        <h1 className="cart-main__title">checkout</h1>
        <CheckoutSteps current="details" />

        <div className="cart-layout">
          <div className="cart-left">
            <h2 className="cart-left__title">
              your cart <span>· {itemCount} item{itemCount === 1 ? "" : "s"}</span>
            </h2>
            <ul className="cart-lines">
              {renderedLines.map(({ item: { id, qty }, key, exiting }) => {
                const product = getProduct(id);
                if (!product) return null;
                return (
                  <CartLineItem
                    key={key}
                    product={product}
                    qty={qty}
                    variant="page"
                    unitCents={unitFor(id)}
                    exiting={exiting}
                  />
                );
              })}
            </ul>

            <form
              id="checkout-form"
              ref={formRef}
              className="cart-shipping"
              onSubmit={onSubmit}
              noValidate
              aria-labelledby="shipping-title"
            >
              <h2 id="shipping-title" className="cart-shipping__title">
                where should we send it?
              </h2>
              <p className="visually-hidden" role="status" aria-live="polite">
                {announcement}
              </p>
              <div className="cart-shipping__grid">
                {FIELDS.map(({ name, label, span, autoComplete, kind, inputMode, maxLength, pattern, hint }) => {
                  const error = errors[name];
                  const valid = touched[name] && !error && values[name].length > 0;
                  const describedBy = [hint && `ck-${name}-hint`, error && `ck-${name}-error`]
                    .filter(Boolean)
                    .join(" ");
                  const common = {
                    id: `ck-${name}`,
                    name,
                    required: true,
                    "aria-required": true as const,
                    autoComplete,
                    value: values[name],
                    onBlur: () => onFieldBlur(name),
                    "aria-invalid": error ? (true as const) : undefined,
                    "aria-describedby": describedBy || undefined,
                  };
                  return (
                    <div
                      key={name}
                      className={`contact-field cart-field--span-${span}`}
                      data-valid={valid || undefined}
                    >
                      <label htmlFor={`ck-${name}`}>
                        {label} <span className="cart-field__req" aria-hidden="true">*</span>
                      </label>
                      {kind === "textarea" ? (
                        <textarea
                          {...common}
                          rows={3}
                          maxLength={maxLength}
                          onChange={(e) => onFieldChange(name, e.target.value)}
                        />
                      ) : kind === "select" ? (
                        <select {...common} onChange={(e) => onFieldChange(name, e.target.value)}>
                          <option value="">Choose your state</option>
                          {INDIAN_STATES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          {...common}
                          type={kind}
                          inputMode={inputMode}
                          maxLength={maxLength}
                          pattern={pattern}
                          autoCapitalize={kind === "email" ? "none" : undefined}
                          spellCheck={kind === "email" ? false : undefined}
                          enterKeyHint={name === "pin" ? "done" : "next"}
                          onChange={(e) => onFieldChange(name, e.target.value)}
                        />
                      )}
                      {hint && !error && (
                        <span id={`ck-${name}-hint`} className="cart-field__hint">
                          {hint}
                        </span>
                      )}
                      {error && (
                        <span id={`ck-${name}-error`} className="contact-error">
                          {error}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {errors.items && (
                <p className="contact-error cart-form-error" role="alert">
                  {errors.items}
                </p>
              )}
            </form>
          </div>

          <aside className="cart-summary" aria-labelledby="summary-title">
            <h2 id="summary-title" className="cart-summary__title">
              order summary
            </h2>

            <p
              key={freeDeliveryBump}
              className={`cart-summary__ship-hint ${remainingForFree === 0 ? "is-free" : ""}`}
              data-celebrate={freeDeliveryBump > 0 && remainingForFree === 0 ? "" : undefined}
            >
              <IconTruck />
              {remainingForFree > 0
                ? `Add ${formatPrice(remainingForFree)} more for free delivery`
                : "You've unlocked free delivery!"}
            </p>

            <div className="cart-summary__row">
              <span>Subtotal</span>
              <AnimatedPrice cents={quote.subtotalCents} />
            </div>
            <div className="cart-summary__row">
              <span>Shipping</span>
              <span>{quote.shippingCents === 0 ? "Free" : formatPrice(quote.shippingCents)}</span>
            </div>
            <div className="cart-summary__row cart-summary__row--total">
              <span>Total</span>
              <AnimatedPrice cents={quote.totalCents} />
            </div>

            <fieldset className="pay-method" disabled={busy}>
              <legend>how to order</legend>
              {PAYMENT_OPTIONS.map((option) => (
                <label key={option.id} data-checked={payMethod === option.id || undefined}>
                  <input
                    type="radio"
                    name="pay-method"
                    value={option.id}
                    checked={payMethod === option.id}
                    onChange={() => setPayMethod(option.id)}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
            </fieldset>

            <div ref={summaryButtonRef}>
              {status === "review" ? (
                <div className="quote-review" role="region" aria-labelledby="review-title">
                  <h3 id="review-title" ref={reviewHeadingRef} tabIndex={-1}>
                    Your total changed
                  </h3>
                  <p>Prices or stock moved while you were checking out. Nothing has been charged.</p>
                  <ul>
                    {changes.map((c) => (
                      <li key={`${c.kind}-${c.id}`}>{describeChange(c)}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="cozy-btn-orange cart-summary__checkout"
                    onClick={() => void submitOrder(quote)}
                  >
                    confirm new total · {formatPrice(quote.totalCents)}
                  </button>
                  <button
                    type="button"
                    className="quote-review__back"
                    onClick={() => {
                      setStatus("idle");
                      setChanges([]);
                    }}
                  >
                    back to cart
                  </button>
                </div>
              ) : (
                <button
                  ref={placeOrderRef}
                  type="submit"
                  form="checkout-form"
                  className={`cozy-btn-orange cart-summary__checkout place-order ${succeeded ? "is-success" : ""}`}
                  disabled={busy || !hydrated}
                  aria-describedby={errors.form ? "place-order-error" : undefined}
                >
                  {succeeded ? (
                    <>
                      <IconCheck className="place-order__check" /> order saved
                    </>
                  ) : placing ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" /> saving your order…
                    </>
                  ) : (
                    <>
                      {errors.form ? "try again" : "place order"} ·{" "}
                      {formatPrice(quote.totalCents)}
                      <IconArrowRight className="cozy-btn-orange__icon" />
                    </>
                  )}
                </button>
              )}
            </div>
            {errors.form && (
              <p id="place-order-error" className="contact-error cart-form-error" role="alert">
                {errors.form}
              </p>
            )}
            <p className="visually-hidden" role="status">
              {succeeded ? "Your order has been saved. Opening WhatsApp and taking you to your confirmation." : ""}
            </p>
            <p className="cart-summary__note">
              No payment is taken on this website. After you place your order we open WhatsApp so you can send it to
              our team; they&apos;ll confirm payment and delivery with you directly.
            </p>
            <Link href="/shop" className="cart-summary__continue">
              ← continue shopping
            </Link>
          </aside>
        </div>
      </section>

      {/* Mobile-only sticky bar. Hidden from assistive tech: it duplicates the summary button. */}
      <div
        className="checkout-sticky"
        data-visible={(!summaryButtonVisible && status !== "review") || undefined}
        aria-hidden="true"
        inert={summaryButtonVisible || status === "review"}
      >
        <div className="checkout-sticky__total">
          <span>total</span>
          <strong>
            <AnimatedPrice cents={quote.totalCents} />
          </strong>
        </div>
        <button
          type="submit"
          form="checkout-form"
          tabIndex={-1}
          className="cozy-btn-orange checkout-sticky__btn"
          disabled={busy || !hydrated}
        >
          {succeeded ? "saved ✓" : placing ? "saving…" : "place order"}
        </button>
      </div>

      <SiteFooter />
    </div>
  );
}
