"use client";

import { useEffect, useRef, useState } from "react";
import { formatPrice } from "@/lib/money";
import { prefersReducedMotion } from "@/lib/motion";
import type { Cents } from "@/lib/types";

const DURATION_MS = 450;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * A price that counts to its new value instead of jumping, so the eye
 * connects "I tapped +" with "the total went up".
 *
 * Screen readers get only the final value (the counting digits are
 * aria-hidden), and reduced-motion users see the new value instantly.
 */
export default function AnimatedPrice({ cents, className }: { cents: Cents; className?: string }) {
  const [shown, setShown] = useState(cents);
  const fromRef = useRef(cents);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const from = fromRef.current;
    if (from === cents) return;
    if (prefersReducedMotion()) {
      fromRef.current = cents;
      setShown(cents);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const value = Math.round(from + (cents - from) * easeOutCubic(t));
      fromRef.current = value;
      setShown(value);
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [cents]);

  return (
    <span className={`animated-price ${className ?? ""}`} data-changing={shown !== cents || undefined}>
      <span aria-hidden="true">{formatPrice(shown)}</span>
      <span className="visually-hidden">{formatPrice(cents)}</span>
    </span>
  );
}
