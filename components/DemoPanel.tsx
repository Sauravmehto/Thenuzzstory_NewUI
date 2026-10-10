"use client";

import { useEffect, useState } from "react";
import { PRODUCTS } from "@/lib/catalog";

/*
 * Demo controls for recording and testing: simulate a slow network, a failed
 * request, a price move and a stock drop. They're stored in a cookie that the
 * cart + checkout routes read (see lib/server/demo.ts).
 * Loaded with next/dynamic only when enabled, so normal visitors download none of it.
 */
const COOKIE = "cp-demo";

interface DemoState {
  latencyMs: number;
  failNextCart: boolean;
  priceBump?: { id: string; percent: number };
  stockDrop?: { id: string; stock: number };
  /** Simulated wallet connects with a low balance (insufficient funds path). */
  walletLow?: boolean;
}

const EMPTY: DemoState = { latencyMs: 0, failNextCart: false };

function read(): DemoState {
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return EMPTY;
  try {
    return { ...EMPTY, ...(JSON.parse(decodeURIComponent(raw.slice(COOKIE.length + 1))) as DemoState) };
  } catch {
    return EMPTY;
  }
}

function write(state: DemoState) {
  document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(state))}; path=/; SameSite=Lax`;
}

export default function DemoPanel() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DemoState>(EMPTY);
  const [product, setProduct] = useState(PRODUCTS.find((p) => p.stock <= 3)?.id ?? PRODUCTS[0]!.id);

  useEffect(() => setState(read()), []);

  // The server consumes "fail next" by rewriting the cookie; reflect that.
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setState(read()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const update = (patch: Partial<DemoState>) => {
    const next = { ...read(), ...patch };
    write(next);
    setState(next);
  };

  const active =
    state.latencyMs > 0 ||
    state.failNextCart ||
    Boolean(state.priceBump) ||
    Boolean(state.stockDrop) ||
    state.walletLow === true;

  return (
    <div className="demo-panel" data-open={open || undefined}>
      <button
        type="button"
        className="demo-panel__toggle"
        aria-expanded={open}
        aria-controls="demo-panel-body"
        onClick={() => setOpen((o) => !o)}
      >
        demo {active && <span className="demo-panel__dot" aria-label="(controls active)" />}
      </button>
      {open && (
        <div id="demo-panel-body" className="demo-panel__body" role="group" aria-label="Demo controls">
          <fieldset>
            <legend>Network latency</legend>
            {[0, 800, 2000].map((ms) => (
              <label key={ms}>
                <input
                  type="radio"
                  name="demo-latency"
                  checked={state.latencyMs === ms}
                  onChange={() => update({ latencyMs: ms })}
                />
                {ms === 0 ? "none" : `${ms / 1000}s`}
              </label>
            ))}
          </fieldset>

          <label className="demo-panel__row">
            <input
              type="checkbox"
              checked={state.failNextCart}
              onChange={(e) => update({ failNextCart: e.target.checked })}
            />
            Fail next cart request
          </label>

          <label className="demo-panel__row">
            <input
              type="checkbox"
              checked={state.walletLow === true}
              onChange={(e) => update({ walletLow: e.target.checked })}
            />
            Wallet has low balance
          </label>

          <label className="demo-panel__row">
            Product
            <select value={product} onChange={(e) => setProduct(e.target.value)}>
              {PRODUCTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (stock {p.stock})
                </option>
              ))}
            </select>
          </label>
          <div className="demo-panel__actions">
            <button type="button" onClick={() => update({ priceBump: { id: product, percent: 15 } })}>
              Raise price 15%
            </button>
            <button type="button" onClick={() => update({ stockDrop: { id: product, stock: 1 } })}>
              Someone bought it (stock → 1)
            </button>
          </div>

          <p className="demo-panel__state">
            {state.priceBump && `Price +${state.priceBump.percent}% on ${state.priceBump.id}. `}
            {state.stockDrop && `Live stock ${state.stockDrop.stock} on ${state.stockDrop.id}.`}
          </p>
          <button type="button" className="demo-panel__reset" onClick={() => update(EMPTY)}>
            Reset all
          </button>
        </div>
      )}
    </div>
  );
}
