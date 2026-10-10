import { useEffect, useState } from "react";

/**
 * Becomes true once the browser is idle after the first render (or after
 * `timeoutMs` at the latest). Below-the-fold animation setup waits for this,
 * so hydration and the first tap aren't competing with GSAP measuring and
 * wiring up sections the visitor hasn't scrolled to yet.
 */
export function useIdleReady(timeoutMs = 1500): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: timeoutMs });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setReady(true), 200);
    return () => window.clearTimeout(id);
  }, [timeoutMs]);
  return ready;
}
