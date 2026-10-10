"use client";

import { useEffect, useRef } from "react";

/**
 * A quantity that rolls up when it grows and down when it shrinks, so the
 * direction of the change is felt, not just read. (Direction is CSS-only;
 * reduced motion shows a plain swap.)
 */
export default function QtyNumber({ value }: { value: number }) {
  // Last committed value (updated after render, so the render stays pure).
  const previous = useRef(value);
  const direction = value > previous.current ? "up" : value < previous.current ? "down" : undefined;
  useEffect(() => {
    previous.current = value;
  }, [value]);
  return (
    <span className="qty-number">
      <span key={value} className="qty-number__value" data-dir={direction}>
        {value}
      </span>
    </span>
  );
}
