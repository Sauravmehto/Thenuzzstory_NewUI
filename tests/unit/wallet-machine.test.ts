import { describe, expect, it } from "vitest";
import {
  REQUIRED_CONFIRMATIONS,
  initialWalletState,
  walletReducer,
  type WalletAccount,
  type WalletEvent,
  type WalletState,
} from "@/lib/wallet-machine";
import type { Quote } from "@/lib/types";

const quote: Quote = {
  lines: [{ id: "a", name: "a", qty: 1, unitCents: 7999, lineCents: 7999 }],
  subtotalCents: 7999,
  shippingCents: 0,
  totalCents: 7999,
};
const rich: WalletAccount = { walletName: "W", address: "0xabc", balanceCents: 100_000 };
const poor: WalletAccount = { ...rich, balanceCents: 500 };

const run = (...events: WalletEvent[]): WalletState => events.reduce(walletReducer, initialWalletState);
const connectAndQuote = (account: WalletAccount): WalletEvent[] => [
  { type: "CHOOSE", walletName: "W" },
  { type: "CONNECTED", account },
  { type: "QUOTED", quote, changes: [] },
];

describe("walletReducer", () => {
  it("happy path: connect → review → sign → pending → confirmed", () => {
    let state = run(...connectAndQuote(rich));
    expect(state.status).toBe("review");
    state = walletReducer(state, { type: "SIGN" });
    expect(state.status).toBe("signing");
    state = walletReducer(state, { type: "APPROVED", txHash: "0xtx" });
    expect(state).toMatchObject({ status: "pending", confirmations: 0 });
    for (let i = 0; i < REQUIRED_CONFIRMATIONS; i++) state = walletReducer(state, { type: "CONFIRMATION" });
    expect(state).toMatchObject({ status: "confirmed", txHash: "0xtx" });
  });

  it("goes to insufficient funds instead of review when the balance can't cover total + fee", () => {
    expect(run(...connectAndQuote(poor))).toMatchObject({ status: "insufficient", neededCents: 8001 });
  });

  it("a rejected signature can be retried with the same locked quote", () => {
    const rejected = run(...connectAndQuote(rich), { type: "SIGN" }, { type: "REJECTED" });
    expect(rejected.status).toBe("rejected");
    expect(walletReducer(rejected, { type: "RETRY" })).toMatchObject({ status: "review", quote });
  });

  it("ignores events that don't belong to the current state (no impossible states)", () => {
    const review = run(...connectAndQuote(rich));
    expect(walletReducer(review, { type: "APPROVED", txHash: "0x" })).toBe(review); // can't approve before signing
    expect(walletReducer(initialWalletState, { type: "CONFIRMATION" })).toBe(initialWalletState);
    const insufficient = run(...connectAndQuote(poor));
    expect(walletReducer(insufficient, { type: "SIGN" })).toBe(insufficient); // can't sign without funds
  });
});
