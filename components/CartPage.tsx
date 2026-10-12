"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import { getProduct } from "@/lib/catalog";
import { saveLastOrder } from "@/lib/last-order";
import { formatPrice } from "@/lib/money";
import { buildQuote, FREE_SHIPPING_THRESHOLD_CENTS } from "@/lib/pricing";
import { CUSTOMER_FIELDS, validateCustomer, validateField, type CustomerField } from "@/lib/validation";
import type {
  CartLine,
  CheckoutCustomer,
  CheckoutRequest,
  CheckoutResponse,
  LineChange,
  Payment,
  Quote,
} from "@/lib/types";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import CartLineItem from "@/components/CartLineItem";
import CheckoutSteps from "@/components/CheckoutSteps";
import { CheckoutSkeleton } from "@/components/Skeletons";
import AnimatedPrice from "@/components/AnimatedPrice";
import WalletPayDialog from "@/components/WalletPayDialog";
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
  inputMode?: "email" | "text";
  hint?: string;
}

// No example values as placeholders: grey "Jane Doe" text reads like a
// filled-in field and people skip it. Labels + a hint where it helps.
const FIELDS: FieldConfig[] = [
  { name: "name", label: "Full name", span: 2, autoComplete: "name" },
  {
    name: "email",
    label: "Email",
    span: 2,
    autoComplete: "email",
    inputMode: "email",
    hint: "for your receipt and tracking, nothing else",
  },
  { name: "address", label: "Address", span: 2, autoComplete: "street-address" },
  { name: "city", label: "City", span: 1, autoComplete: "address-level2" },
  { name: "zip", label: "Postal code", span: 1, autoComplete: "postal-code" },
];

type Status = "idle" | "placing" | "review" | "success";
type PayMethod = "card" | "wallet";

/** Stable signature of a quote, so a retry of the same order reuses its key. */
const signature = (q: Quote) =>
  q.lines.map((l) => `${l.id}:${l.qty}:${l.unitCents}`).join("|") + `=${q.totalCents}`;

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

const emptyCustomer: CheckoutCustomer = { name: "", email: "", address: "", city: "", zip: "" };

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
  const [payMethod, setPayMethod] = useState<PayMethod>("card");
  const [walletOpen, setWalletOpen] = useState(false);
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
    if (el instanceof HTMLInputElement) el.focus();
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

  async function submitOrder(expected: Quote, payment: Payment = { method: "card" }) {
    if (inFlight.current) return; // blocks double-clicks within the same frame
    if (!checkForm()) return;

    inFlight.current = true;
    setStatus("placing");
    setErrors({});
    setAnnouncement("");

    // Same order intent → same key, so a retry can never create a second order.
    const sig = signature(expected);
    if (idempotency.current?.sig !== sig) {
      idempotency.current = { sig, key: crypto.randomUUID() };
    }

    const body: CheckoutRequest = {
      customer: values,
      items: expected.lines.map(({ id, qty }) => ({ id, qty })),
      expected: { lines: expected.lines, totalCents: expected.totalCents },
      payment,
    };

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotency.current.key,
        },
        body: JSON.stringify(body),
      });
      const result = (await res.json()) as CheckoutResponse;

      if (result.ok) {
        saveLastOrder({
          orderId: result.orderId,
          placedAt: new Date().toISOString(),
          quote: result.quote,
          customer: values,
          payment: result.payment,
        });
        // A short "order placed ✓" beat on the button before we move on,
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
      setErrors({ form: "Network hiccup: your order wasn't placed. Please try again." });
      setShakeKey((k) => k + 1);
      setStatus("idle");
    } finally {
      inFlight.current = false;
    }
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (payMethod === "wallet") {
      // Same form check, then the wallet takes over (connect → review → sign → confirm).
      if (checkForm()) setWalletOpen(true);
      return;
    }
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
                {FIELDS.map(({ name, label, span, autoComplete, inputMode, hint }) => {
                  const error = errors[name];
                  const valid = touched[name] && !error && values[name].length > 0;
                  const describedBy = [hint && `ck-${name}-hint`, error && `ck-${name}-error`]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <div
                      key={name}
                      className={`contact-field cart-field--span-${span}`}
                      data-valid={valid || undefined}
                    >
                      <label htmlFor={`ck-${name}`}>{label}</label>
                      <input
                        id={`ck-${name}`}
                        name={name}
                        type={name === "email" ? "email" : "text"}
                        inputMode={inputMode}
                        autoComplete={autoComplete}
                        autoCapitalize={name === "email" ? "none" : undefined}
                        spellCheck={name === "email" ? false : undefined}
                        enterKeyHint={name === "zip" ? "done" : "next"}
                        value={values[name]}
                        onChange={(e) => onFieldChange(name, e.target.value)}
                        onBlur={() => onFieldBlur(name)}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={describedBy || undefined}
                      />
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
              <legend>pay with</legend>
              <label data-checked={payMethod === "card" || undefined}>
                <input
                  type="radio"
                  name="pay-method"
                  value="card"
                  checked={payMethod === "card"}
                  onChange={() => setPayMethod("card")}
                />
                <span>
                  <strong>card</strong>
                  <small>demo: nothing is charged</small>
                </span>
              </label>
              <label data-checked={payMethod === "wallet" || undefined}>
                <input
                  type="radio"
                  name="pay-method"
                  value="wallet"
                  checked={payMethod === "wallet"}
                  onChange={() => setPayMethod("wallet")}
                />
                <span>
                  <strong>
                    crypto wallet <span className="wallet-sim-badge">simulated</span>
                  </strong>
                  <small>connect, sign, confirm</small>
                </span>
              </label>
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
                      <IconCheck className="place-order__check" /> order placed
                    </>
                  ) : placing ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" /> placing order…
                    </>
                  ) : (
                    <>
                      {payMethod === "wallet" ? "pay with wallet" : errors.form ? "try again" : "place order"} ·{" "}
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
              {succeeded ? "Order placed. Taking you to your receipt." : ""}
            </p>
            <p className="cart-summary__note">demo store: no real payment is taken.</p>
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
          {succeeded ? "placed ✓" : placing ? "placing…" : payMethod === "wallet" ? "pay with wallet" : "place order"}
        </button>
      </div>

      <WalletPayDialog
        open={walletOpen}
        items={items}
        shownQuote={quote}
        onClose={() => setWalletOpen(false)}
        onQuoteChanged={(serverPriced) => {
          setServerQuote(serverPriced);
          replaceLines(serverPriced.lines.map(({ id, qty }) => ({ id, qty })));
        }}
        onPaid={({ account, txHash, quote: paidQuote }) =>
          void submitOrder(paidQuote, { method: "wallet", account, txHash })
        }
      />

      <SiteFooter />
    </div>
  );
}
