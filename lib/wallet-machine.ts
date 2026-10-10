import type { Cents, LineChange, Quote } from "./types";

/*
 * Wallet checkout as a state machine.
 *
 * Wallet flows have many states that must never overlap: you can't be
 * "awaiting signature" and "pending" at once, and a rejected signature must
 * never look like a failed payment. Modelling it as one discriminated union
 * plus a pure reducer makes impossible states unrepresentable, and every
 * transition is unit-tested (tests/unit/wallet-machine.test.ts).
 *
 *   select → connecting → quoting → review ─┬→ signing → pending → confirmed
 *                                           ├→ insufficient
 *                                signing ───┴→ rejected → (retry) review
 */

export const NETWORK_FEE_CENTS: Cents = 2; // shown to the user; paid from the wallet
export const REQUIRED_CONFIRMATIONS = 2;

export interface WalletAccount {
  walletName: string;
  address: string;
  balanceCents: Cents;
}

export type WalletState =
  | { status: "select" }
  | { status: "connecting"; walletName: string }
  | { status: "quoting"; account: WalletAccount }
  | { status: "review"; account: WalletAccount; quote: Quote; changes: LineChange[] }
  | { status: "insufficient"; account: WalletAccount; quote: Quote; neededCents: Cents }
  | { status: "signing"; account: WalletAccount; quote: Quote }
  | { status: "rejected"; account: WalletAccount; quote: Quote }
  | { status: "pending"; account: WalletAccount; quote: Quote; txHash: string; confirmations: number }
  | { status: "confirmed"; account: WalletAccount; quote: Quote; txHash: string }
  | { status: "error"; message: string; account?: WalletAccount };

export type WalletEvent =
  | { type: "CHOOSE"; walletName: string }
  | { type: "CONNECTED"; account: WalletAccount }
  | { type: "QUOTED"; quote: Quote; changes: LineChange[] }
  | { type: "SIGN" }
  | { type: "APPROVED"; txHash: string }
  | { type: "REJECTED" }
  | { type: "CONFIRMATION" }
  | { type: "RETRY" }
  | { type: "FAIL"; message: string }
  | { type: "RESET" };

export const initialWalletState: WalletState = { status: "select" };

export const amountDue = (quote: Quote): Cents => quote.totalCents + NETWORK_FEE_CENTS;

export function walletReducer(state: WalletState, event: WalletEvent): WalletState {
  switch (event.type) {
    case "RESET":
      return initialWalletState;

    case "CHOOSE":
      return state.status === "select" ? { status: "connecting", walletName: event.walletName } : state;

    case "CONNECTED":
      return state.status === "connecting" ? { status: "quoting", account: event.account } : state;

    case "QUOTED": {
      if (state.status !== "quoting") return state;
      const needed = amountDue(event.quote);
      return state.account.balanceCents < needed
        ? { status: "insufficient", account: state.account, quote: event.quote, neededCents: needed }
        : { status: "review", account: state.account, quote: event.quote, changes: event.changes };
    }

    case "SIGN":
      return state.status === "review"
        ? { status: "signing", account: state.account, quote: state.quote }
        : state;

    case "APPROVED":
      return state.status === "signing"
        ? { status: "pending", account: state.account, quote: state.quote, txHash: event.txHash, confirmations: 0 }
        : state;

    case "REJECTED":
      return state.status === "signing"
        ? { status: "rejected", account: state.account, quote: state.quote }
        : state;

    case "CONFIRMATION": {
      if (state.status !== "pending") return state;
      const confirmations = state.confirmations + 1;
      return confirmations >= REQUIRED_CONFIRMATIONS
        ? { status: "confirmed", account: state.account, quote: state.quote, txHash: state.txHash }
        : { ...state, confirmations };
    }

    case "RETRY":
      // After a rejection, go back to review with the same locked quote.
      return state.status === "rejected"
        ? { status: "review", account: state.account, quote: state.quote, changes: [] }
        : state;

    case "FAIL":
      return { status: "error", message: event.message, account: "account" in state ? state.account : undefined };
  }
}

/** "0x3f2a…9c1d" */
export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
