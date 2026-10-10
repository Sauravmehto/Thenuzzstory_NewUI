import type { WalletAccount } from "./wallet-machine";

/*
 * A pretend wallet so the checkout states can be shown without a browser
 * extension or real funds. Everything here is fake and labelled as such in
 * the UI. A real build would swap this file for wagmi/viem calls
 * (connect, switchChain, sendTransaction, waitForTransactionReceipt).
 */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function randomHex(bytes: number): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return `0x${Array.from(values, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Reads the demo-panel cookie (see components/DemoPanel.tsx) for a low balance. */
function demoLowBalance(): boolean {
  const raw = document.cookie.split("; ").find((c) => c.startsWith("cp-demo="));
  if (!raw) return false;
  try {
    return JSON.parse(decodeURIComponent(raw.slice("cp-demo=".length))).walletLow === true;
  } catch {
    return false;
  }
}

export const SIM_WALLETS = [
  { name: "Pawprint Wallet", note: "browser extension" },
  { name: "Kennel Key", note: "hardware wallet" },
] as const;

export async function connectWallet(walletName: string): Promise<WalletAccount> {
  await sleep(900);
  return {
    walletName,
    address: randomHex(20),
    balanceCents: demoLowBalance() ? 2_500 : 250_000,
  };
}

/** Called after the user approves in the (simulated) wallet window. */
export async function broadcastTransaction(): Promise<string> {
  await sleep(700);
  return randomHex(32);
}

export const CONFIRMATION_INTERVAL_MS = 1100;
