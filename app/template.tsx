"use client";

import { useEffect, useState, type ReactNode } from "react";

// Module-level: false only for the very first page the visitor lands on.
let hasNavigated = false;

/**
 * A soft fade between pages. Opacity only (no transforms) so fixed-position
 * children like the navbar and sticky bars aren't knocked out of place.
 * Skipped on first load (it would only delay the first paint) and when a
 * shared-element view transition is already animating the change.
 */
export default function Template({ children }: { children: ReactNode }) {
  const [animate] = useState(() => hasNavigated);
  useEffect(() => {
    hasNavigated = true;
  }, []);
  return <div className={animate ? "page-enter" : undefined}>{children}</div>;
}
