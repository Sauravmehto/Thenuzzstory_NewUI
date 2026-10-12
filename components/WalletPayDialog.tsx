"use client";

import { useEffect, useReducer, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "@/lib/hooks/useDialog";
import { formatPrice } from "@/lib/money";
import {
  CONFIRMATION_INTERVAL_MS,
  SIM_WALLETS,
  broadcastTransaction,
  connectWallet,
} from "@/lib/sim-wallet";
import {
  NETWORK_FEE_CENTS,
  REQUIRED_CONFIRMATIONS,
  amountDue,
  initialWalletState,
  shortAddress,
  walletReducer,
  type WalletState,
} from "@/lib/wallet-machine";
import type { CartLine, LineChange, Quote, QuoteResponse } from "@/lib/types";
import { IconCheck, IconClose } from "@/components/icons";

interface Props {
  open: boolean;
  items: CartLine[];
  /** What the checkout page is currently showing (used to detect price moves). */
  shownQuote: Quote;
  onClose: () => void;
  /** The server re-priced the cart: let the page show the same numbers. */
  onQuoteChanged: (quote: Quote) => void;
  onPaid: (payment: { account: string; txHash: string; quote: Quote }) => void;
}

const STEPS = ["connect", "review", "sign", "confirm"] as const;

function stepIndex(state: WalletState): number {
  switch (state.status) {
    case "select":
    case "connecting":
      return 0;
    case "quoting":
    case "review":
    case "insufficient":
      return 1;
    case "signing":
    case "rejected":
      return 2;
    default:
      return 3;
  }
}

function describeChange(c: LineChange) {
  if (c.kind === "price") return `${c.name}: ${formatPrice(c.fromCents)} → ${formatPrice(c.toCents)}`;
  if (c.kind === "qty") return `${c.name}: only ${c.toQty} available`;
  return `${c.name}: no longer available`;
}

export default function WalletPayDialog({ open, items, shownQuote, onClose, onQuoteChanged, onPaid }: Props) {
  const [state, dispatch] = useReducer(walletReducer, initialWalletState);
  const [approving, setApproving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Money in flight: closing now would hide a transaction that's still confirming.
  const locked = state.status === "pending" || state.status === "confirmed";
  const requestClose = () => {
    if (!locked) onClose();
  };
  useDialog(dialogRef, open, requestClose, headingRef);

  // Fresh start every time the dialog opens.
  useEffect(() => {
    if (open) dispatch({ type: "RESET" });
  }, [open]);

  // Move focus to each step's heading so screen readers hear the new state.
  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open, state.status]);

  // Side effects live here; the reducer stays pure and testable.
  useEffect(() => {
    let cancelled = false;

    if (state.status === "connecting") {
      void connectWallet(state.walletName).then((account) => {
        if (!cancelled) dispatch({ type: "CONNECTED", account });
      });
    }

    if (state.status === "quoting") {
      // Lock the price BEFORE asking for a signature (see app/api/quote).
      void fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, expected: { lines: shownQuote.lines, totalCents: shownQuote.totalCents } }),
      })
        .then((res) => res.json() as Promise<QuoteResponse>)
        .then((result) => {
          if (cancelled) return;
          if (!result.ok) return dispatch({ type: "FAIL", message: result.message });
          if (result.changes.length > 0 || result.quote.totalCents !== shownQuote.totalCents) {
            onQuoteChanged(result.quote);
          }
          dispatch({ type: "QUOTED", quote: result.quote, changes: result.changes });
        })
        .catch(() => {
          if (!cancelled) dispatch({ type: "FAIL", message: "Couldn't reach the store to lock your price." });
        });
    }

    if (state.status === "pending") {
      const timer = window.setTimeout(() => dispatch({ type: "CONFIRMATION" }), CONFIRMATION_INTERVAL_MS);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    if (state.status === "confirmed") {
      const { account, txHash, quote } = state;
      const timer = window.setTimeout(() => onPaid({ account: account.address, txHash, quote }), 700);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }

    return () => {
      cancelled = true;
    };
    // Runs once per state transition; the other values are read at that moment.
  }, [state]);

  const approve = async () => {
    setApproving(true);
    const txHash = await broadcastTransaction();
    setApproving(false);
    dispatch({ type: "APPROVED", txHash });
  };

  const current = stepIndex(state);

  // Portal to <body> so everything else can be made inert while it's open.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="drawer-root">
      <div
        className={`wallet-backdrop ${open ? "is-open" : ""}`}
        onClick={requestClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        className={`wallet-dialog ${open ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-title"
        aria-describedby="wallet-sim-note"
        tabIndex={-1}
        inert={!open}
      >
        <div className="wallet-dialog__head">
          <p className="wallet-dialog__eyebrow">
            pay with wallet <span className="wallet-sim-badge">simulated</span>
          </p>
          <button
            type="button"
            className="cozy-icon-btn"
            aria-label="Close"
            onClick={requestClose}
            disabled={locked}
          >
            <IconClose className="cozy-icon" />
          </button>
        </div>

        <ol className="wallet-steps" aria-label="Wallet payment progress">
          {STEPS.map((label, i) => (
            <li
              key={label}
              data-state={i < current ? "done" : i === current ? "current" : "upcoming"}
              aria-current={i === current ? "step" : undefined}
            >
              {label}
            </li>
          ))}
        </ol>

        <div className="wallet-dialog__body" aria-live="polite">
          {state.status === "select" && (
            <>
              <h2 id="wallet-title" ref={headingRef} tabIndex={-1}>
                connect a wallet
              </h2>
              <ul className="wallet-options">
                {SIM_WALLETS.map((w) => (
                  <li key={w.name}>
                    <button type="button" onClick={() => dispatch({ type: "CHOOSE", walletName: w.name })}>
                      <span className="wallet-options__icon" aria-hidden="true">
                        {w.name[0]}
                      </span>
                      <span>
                        <strong>{w.name}</strong>
                        <small>{w.note}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {state.status === "connecting" && (
            <Waiting headingRef={headingRef} title={`opening ${state.walletName}…`}>
              approve the connection in your wallet.
            </Waiting>
          )}

          {state.status === "quoting" && (
            <Waiting headingRef={headingRef} title="locking your price…">
              we fix the amount before you sign, so what you approve is exactly what you pay.
            </Waiting>
          )}

          {(state.status === "review" || state.status === "insufficient") && (
            <>
              <h2 id="wallet-title" ref={headingRef} tabIndex={-1}>
                {state.status === "review" ? "review payment" : "not enough funds"}
              </h2>
              <AccountRow name={state.account.walletName} address={state.account.address} balance={state.account.balanceCents} />

              {state.status === "review" && state.changes.length > 0 && (
                <div className="wallet-note wallet-note--warn">
                  <strong>your total changed</strong> while you were checking out:
                  <ul>
                    {state.changes.map((c) => (
                      <li key={`${c.kind}-${c.id}`}>{describeChange(c)}</li>
                    ))}
                  </ul>
                </div>
              )}

              <dl className="wallet-amounts">
                <div>
                  <dt>order total</dt>
                  <dd>{formatPrice(state.quote.totalCents)}</dd>
                </div>
                <div>
                  <dt>network fee (est.)</dt>
                  <dd>{formatPrice(NETWORK_FEE_CENTS)}</dd>
                </div>
                <div className="wallet-amounts__total">
                  <dt>you&apos;ll send</dt>
                  <dd>{formatPrice(amountDue(state.quote))}</dd>
                </div>
              </dl>

              {state.status === "review" ? (
                <button type="button" className="cozy-btn-orange wallet-primary" onClick={() => dispatch({ type: "SIGN" })}>
                  confirm in wallet
                </button>
              ) : (
                <>
                  <p className="wallet-note wallet-note--error" role="alert">
                    Your wallet has {formatPrice(state.account.balanceCents)}, and this needs{" "}
                    {formatPrice(state.neededCents)}. Nothing was sent.
                  </p>
                  <button type="button" className="cozy-btn-orange wallet-primary" onClick={onClose}>
                    pay by card instead
                  </button>
                </>
              )}
            </>
          )}

          {(state.status === "signing" || state.status === "rejected") && (
            <>
              <h2 id="wallet-title" ref={headingRef} tabIndex={-1}>
                {state.status === "signing" ? "check your wallet" : "signature rejected"}
              </h2>
              {state.status === "signing" ? (
                <>
                  <p className="wallet-muted">approve the payment in {state.account.walletName} to continue.</p>
                  {/* Stand-in for the wallet's own popup. In a real app this is the extension, not our UI. */}
                  <div className="sim-wallet" role="group" aria-label={`${state.account.walletName} (simulated)`}>
                    <p className="sim-wallet__app">
                      {state.account.walletName} <span>simulated</span>
                    </p>
                    <p className="sim-wallet__title">payment request</p>
                    <p className="sim-wallet__site">thenuzzstory.demo</p>
                    <p className="sim-wallet__amount">{formatPrice(amountDue(state.quote))}</p>
                    <p className="sim-wallet__from">from {shortAddress(state.account.address)}</p>
                    <div className="sim-wallet__actions">
                      <button type="button" onClick={() => dispatch({ type: "REJECTED" })} disabled={approving}>
                        reject
                      </button>
                      <button type="button" className="is-primary" onClick={() => void approve()} disabled={approving}>
                        {approving ? "sending…" : "approve"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="wallet-note">No worries: nothing was sent and you haven&apos;t been charged.</p>
                  <button type="button" className="cozy-btn-orange wallet-primary" onClick={() => dispatch({ type: "RETRY" })}>
                    try again
                  </button>
                  <button type="button" className="wallet-secondary" onClick={onClose}>
                    pay by card instead
                  </button>
                </>
              )}
            </>
          )}

          {(state.status === "pending" || state.status === "confirmed") && (
            <>
              <h2 id="wallet-title" ref={headingRef} tabIndex={-1}>
                {state.status === "pending" ? "payment on its way" : "payment confirmed"}
              </h2>
              <div className="wallet-progress" data-done={state.status === "confirmed" || undefined}>
                <span className="wallet-progress__icon" aria-hidden="true">
                  {state.status === "confirmed" ? <IconCheck /> : <span className="btn-spinner" />}
                </span>
                <p>
                  {state.status === "pending"
                    ? `waiting for confirmations: ${state.confirmations} of ${REQUIRED_CONFIRMATIONS}`
                    : "placing your order…"}
                </p>
              </div>
              <p className="wallet-muted">
                transaction <code>{shortAddress(state.txHash)}</code>
                {state.status === "pending" && ". keep this open, it only takes a few seconds."}
              </p>
            </>
          )}

          {state.status === "error" && (
            <>
              <h2 id="wallet-title" ref={headingRef} tabIndex={-1}>
                something went wrong
              </h2>
              <p className="wallet-note wallet-note--error" role="alert">
                {state.message} Nothing was sent.
              </p>
              <button type="button" className="cozy-btn-orange wallet-primary" onClick={() => dispatch({ type: "RESET" })}>
                start again
              </button>
            </>
          )}
        </div>

        <p id="wallet-sim-note" className="wallet-dialog__foot">
          This is a simulated wallet for a demo store: no real wallet, network or funds are used.
        </p>
      </div>
    </div>,
    document.body,
  );
}

function Waiting({
  headingRef,
  title,
  children,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <h2 id="wallet-title" ref={headingRef} tabIndex={-1}>
        {title}
      </h2>
      <div className="wallet-progress">
        <span className="wallet-progress__icon" aria-hidden="true">
          <span className="btn-spinner" />
        </span>
        <p>{children}</p>
      </div>
    </>
  );
}

function AccountRow({ name, address, balance }: { name: string; address: string; balance: number }) {
  return (
    <div className="wallet-account">
      <span className="wallet-options__icon" aria-hidden="true">
        {name[0]}
      </span>
      <div>
        <p>
          <strong>{name}</strong> · <code>{shortAddress(address)}</code>
        </p>
        <p className="wallet-muted">balance {formatPrice(balance)}</p>
      </div>
    </div>
  );
}
