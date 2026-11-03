import type { NextRequest } from "next/server";

/**
 * Demo controls (see components/DemoPanel.tsx) travel as a cookie so they work
 * on serverless hosting, where in-memory state isn't shared between requests.
 * They let me show slow networks, failures and price changes on camera.
 */
export const DEMO_COOKIE = "cp-demo";

export interface DemoState {
  /** Artificial latency added to cart + checkout routes. */
  latencyMs: number;
  /** Next cart update fails with a server error (consumed once). */
  failNextCart: boolean;
  /** Raise one product's price by this many percent (simulates a price move). */
  priceBump?: { id: string; percent: number };
  /** Live stock for one product drops (someone else bought it). */
  stockDrop?: { id: string; stock: number };
}

export const DEFAULT_DEMO: DemoState = { latencyMs: 0, failNextCart: false };

/**
 * Demo controls can change the SERVER's prices and stock (priceBump,
 * stockDrop), and they arrive in a cookie the browser controls. On a live
 * store that would let anyone order at a price they picked, so they only work
 * in development and in the test build (demo-USD profile). Everywhere else the
 * cookie is ignored.
 */
export const demoEnabled = () =>
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_STORE_PROFILE === "demo-usd";

export function readDemo(req: NextRequest): DemoState {
  if (!demoEnabled()) return DEFAULT_DEMO;
  const raw = req.cookies.get(DEMO_COOKIE)?.value;
  if (!raw) return DEFAULT_DEMO;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<DemoState>;
    return {
      latencyMs: Math.min(Math.max(Number(parsed.latencyMs) || 0, 0), 5000),
      failNextCart: parsed.failNextCart === true,
      priceBump:
        parsed.priceBump && typeof parsed.priceBump.id === "string"
          ? { id: parsed.priceBump.id, percent: Math.min(Math.max(Number(parsed.priceBump.percent) || 0, -90), 200) }
          : undefined,
      stockDrop:
        parsed.stockDrop && typeof parsed.stockDrop.id === "string"
          ? { id: parsed.stockDrop.id, stock: Math.max(0, Math.floor(Number(parsed.stockDrop.stock) || 0)) }
          : undefined,
    };
  } catch {
    return DEFAULT_DEMO;
  }
}

export const serializeDemo = (state: DemoState): string =>
  encodeURIComponent(JSON.stringify(state));

export const sleep = (ms: number) =>
  ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
