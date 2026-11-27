"use client";

import { useEffect, useState } from "react";

/**
 * Phones: a "Book grooming" bar after the hero, hidden while the booking
 * section itself is on screen (no point pointing at what you're looking at).
 */
export default function StickyBookBar({ fromLabel }: { fromLabel: string | null }) {
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<"discover" | "decide">("discover");
  useEffect(() => {
    const hero = document.querySelector(".gr-hero");
    const prices = document.getElementById("prices");
    const book = document.getElementById("book");
    if (!hero || !prices || !book || !("IntersectionObserver" in window)) return;
    let heroVisible = true;
    let pricesSeen = false;
    let bookVisible = false;
    const update = () => {
      setShow(!heroVisible && !bookVisible);
      setPhase(pricesSeen ? "decide" : "discover");
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) heroVisible = e.isIntersecting;
        if (e.target === prices && e.isIntersecting) pricesSeen = true;
        if (e.target === book) bookVisible = e.isIntersecting;
      }
      update();
    });
    io.observe(hero);
    io.observe(prices);
    io.observe(book);
    return () => io.disconnect();
  }, []);

  const ctaLabel = phase === "decide" ? "Book now" : "Get estimate";
  const headline = phase === "decide" ? "Ready for a spa day?" : "Premium grooming";
  return (
    <div className="gr-sticky" data-show={show || undefined} data-phase={phase} aria-hidden={!show}>
      <p>
        <strong>{headline}</strong>
        {fromLabel && <span> from {fromLabel}</span>}
      </p>
      <a href="#book" className="gr-btn gr-btn--amber gr-btn--sm" tabIndex={show ? 0 : -1}>
        {ctaLabel}
      </a>
    </div>
  );
}
