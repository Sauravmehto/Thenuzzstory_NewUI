"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useAccount } from "@/lib/account";
import { PASSWORD_MIN, validateSignIn, validateSignUp, type AccountError, type AccountOrder } from "@/lib/account-types";
import { productHref, getProduct } from "@/lib/catalog";
import { useDialog } from "@/lib/hooks/useDialog";
import { formatPrice } from "@/lib/money";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-types";
import { IconClose, IconTruck } from "@/components/icons";

type FieldErrors = NonNullable<AccountError["errors"]>;

/**
 * Side panel for the account: sign in, create an account, and order history.
 * Reuses the cart drawer's look (.shop-cart*), so it slides in from the same side.
 */
export default function AccountDrawer() {
  const { panel, closePanel } = useAccount();
  const isOpen = panel !== null;
  const dialogRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useDialog(dialogRef, isOpen, closePanel, panel === "orders" ? headingRef : undefined);

  const title = panel === "signup" ? "create your account" : panel === "orders" ? "your orders" : "sign in";

  return (
    <div className="drawer-root">
      <div className={`shop-cart-backdrop ${isOpen ? "is-open" : ""}`} onClick={closePanel} aria-hidden="true" />
      <aside
        ref={dialogRef}
        className={`shop-cart account-drawer ${isOpen ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-drawer-title"
        tabIndex={-1}
        inert={!isOpen}
      >
        <div className="shop-cart__head">
          <h2 id="account-drawer-title" ref={headingRef} tabIndex={-1} className="shop-cart__title">
            {title}
          </h2>
          <button type="button" className="cozy-icon-btn" aria-label="Close" onClick={closePanel}>
            <IconClose className="cozy-icon" />
          </button>
        </div>
        {panel === "orders" ? <OrdersPanel /> : panel ? <AuthPanel key={panel} mode={panel} /> : null}
      </aside>
    </div>
  );
}

// ---- sign in / create account ---------------------------------------------------

function AuthPanel({ mode }: { mode: "signin" | "signup" }) {
  const { signIn, signUp, openPanel, closePanel, available } = useAccount();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const isSignUp = mode === "signup";

  // Check a field when it's left, and re-check it as it's corrected.
  // `latest` is the value just typed: state hasn't updated yet inside onChange.
  const check = (field: keyof FieldErrors, latest?: string) => {
    const values = { name, email, password, ...(latest !== undefined ? { [field]: latest } : {}) };
    const all = isSignUp ? validateSignUp(values).errors : validateSignIn(values).errors;
    setErrors((e) => ({ ...e, [field]: all[field] }));
  };

  const focusFirstError = (errs: FieldErrors) => {
    const first = (["name", "email", "password"] as const).find((f) => errs[f]);
    if (first) formRef.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const local = isSignUp ? validateSignUp({ name, email, password }).errors : validateSignIn({ email, password }).errors;
    setErrors(local);
    if (Object.keys(local).length) {
      setMessage(null);
      focusFirstError(local);
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = isSignUp ? await signUp(name, email, password) : await signIn(email, password);
    setBusy(false);
    if (result.ok) {
      setMessage({ tone: "ok", text: isSignUp ? "Account created. Welcome to the pack!" : "Signed in. Welcome back!" });
      setPassword("");
      window.setTimeout(closePanel, 900);
      return;
    }
    setErrors(result.error.errors ?? {});
    setMessage({ tone: "error", text: result.error.message });
    if (result.error.errors) focusFirstError(result.error.errors);
  };

  const field = (key: keyof FieldErrors) => ({
    name: key,
    id: `${id}-${key}`,
    "aria-invalid": errors[key] ? true : undefined,
    "aria-describedby": errors[key] ? `${id}-${key}-error` : key === "password" && isSignUp ? `${id}-password-hint` : undefined,
    onBlur: () => check(key),
    disabled: busy,
  });
  const fieldError = (key: keyof FieldErrors) =>
    errors[key] ? (
      <p className="account-form__error" id={`${id}-${key}-error`}>
        {errors[key]}
      </p>
    ) : null;

  if (!available)
    return (
      <div className="shop-cart__empty">
        <p>Sign-in isn&apos;t available right now. You can still shop and check out as a guest.</p>
      </div>
    );

  return (
    <form ref={formRef} className="account-form" onSubmit={submit} noValidate>
      <p className="account-form__intro">
        {isSignUp
          ? "Save your cart and wishlist, and see your orders on any device."
          : "Welcome back! Your saved cart and wishlist come with you."}
      </p>

      {isSignUp && (
        <div className="contact-field account-form__field">
          <label htmlFor={`${id}-name`}>Full name</label>
          <input
            {...field("name")}
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) check("name", e.target.value);
            }}
          />
          {fieldError("name")}
        </div>
      )}

      <div className="contact-field account-form__field">
        <label htmlFor={`${id}-email`}>Email address</label>
        <input
          {...field("email")}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (errors.email) check("email", e.target.value);
          }}
        />
        {fieldError("email")}
      </div>

      <div className="contact-field account-form__field">
        <label htmlFor={`${id}-password`}>Password</label>
        <div className="account-form__password">
          <input
            {...field("password")}
            type={showPassword ? "text" : "password"}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) check("password", e.target.value);
            }}
          />
          <button
            type="button"
            className="account-form__reveal"
            aria-pressed={showPassword}
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? "hide" : "show"}
          </button>
        </div>
        {isSignUp && !errors.password && (
          <p className="account-form__hint" id={`${id}-password-hint`}>
            At least {PASSWORD_MIN} characters, with a letter and a number.
          </p>
        )}
        {fieldError("password")}
      </div>

      <div aria-live="polite">
        {message && (
          <p className={`account-form__message account-form__message--${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
            {message.text}
          </p>
        )}
      </div>

      <button type="submit" className="cozy-btn-orange account-form__submit" disabled={busy}>
        {busy ? (isSignUp ? "creating your account…" : "signing in…") : isSignUp ? "create account" : "sign in"}
      </button>

      <p className="account-form__switch">
        {isSignUp ? "Already have an account?" : "New here?"}{" "}
        <button type="button" onClick={() => openPanel(isSignUp ? "signin" : "signup")}>
          {isSignUp ? "Sign in" : "Create an account"}
        </button>
      </p>
    </form>
  );
}

// ---- order history ------------------------------------------------------------------

function OrdersPanel() {
  const { status, loadOrders, openPanel, closePanel } = useAccount();
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error"; text: string } | { kind: "ready"; orders: AccountOrder[] }>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (status !== "signedIn") return;
    let cancelled = false;
    setState({ kind: "loading" });
    void loadOrders().then((res) => {
      if (cancelled) return;
      setState(res.ok ? { kind: "ready", orders: res.orders } : { kind: "error", text: res.error.message });
    });
    return () => {
      cancelled = true;
    };
  }, [status, loadOrders, attempt]);

  if (status === "loading") return <p className="account-drawer__status" role="status">Loading…</p>;

  if (status !== "signedIn")
    return (
      <div className="shop-cart__empty">
        <IconTruck className="wl-empty-star" />
        <p>Sign in to see orders you&apos;ve placed while signed in.</p>
        <button type="button" className="cozy-btn-orange" onClick={() => openPanel("signin")}>
          sign in
        </button>
      </div>
    );

  if (state.kind === "loading") return <p className="account-drawer__status" role="status">Loading your orders…</p>;

  if (state.kind === "error")
    return (
      <div className="shop-cart__empty">
        <p role="alert">{state.text}</p>
        <button type="button" className="cozy-btn-orange" onClick={() => setAttempt((n) => n + 1)}>
          try again
        </button>
      </div>
    );

  if (state.orders.length === 0)
    return (
      <div className="shop-cart__empty">
        <IconTruck className="wl-empty-star" />
        <p>No orders yet. Orders you place while signed in will show up here, with their status.</p>
        <Link href="/shop" className="cozy-btn-orange" onClick={closePanel}>
          start shopping
        </Link>
      </div>
    );

  return (
    <ul className="shop-cart__list account-orders">
      {state.orders.map((order) => (
        <li key={order.orderId} className="account-order">
          <div className="account-order__head">
            <p className="account-order__id">Order {order.orderId}</p>
            <time dateTime={order.placedAt}>
              {new Date(order.placedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </time>
          </div>
          {order.status && order.paymentStatus && (
            <p className="account-order__status">
              <span data-tone="pending">{ORDER_STATUS_LABEL[order.status]}</span>
              <span data-tone="pending">{PAYMENT_STATUS_LABEL[order.paymentStatus]}</span>
            </p>
          )}
          <ul className="account-order__lines">
            {order.lines.map((line) => {
              const product = getProduct(line.id);
              return (
                <li key={line.id}>
                  {product ? (
                    <Link href={productHref(product)} onClick={closePanel}>
                      {line.name}
                    </Link>
                  ) : (
                    <span>{line.name}</span>
                  )}
                  <span className="account-order__qty">
                    {line.qty} × {formatPrice(line.unitCents)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="account-order__total">
            <span>
              {order.shippingCents === 0 ? "Free delivery" : `Delivery ${formatPrice(order.shippingCents)}`}
              {order.city ? ` · to ${order.city}` : ""}
            </span>
            <strong>{formatPrice(order.totalCents)}</strong>
          </p>
        </li>
      ))}
    </ul>
  );
}
