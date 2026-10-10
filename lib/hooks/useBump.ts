import { useEffect, useRef, useState } from "react";

/**
 * Returns a key that changes only when `value` goes UP after the first
 * hydrated render, so a badge can replay its bump animation on "add"
 * without bumping on every page load or on removals.
 */
export function useBump(value: number, ready = true): number {
  const [bumpKey, setBumpKey] = useState(0);
  const previous = useRef<number | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (previous.current !== null && value > previous.current) setBumpKey((k) => k + 1);
    previous.current = value;
  }, [value, ready]);
  return bumpKey;
}
