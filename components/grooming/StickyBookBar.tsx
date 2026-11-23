"use client";

import { useEffect, useState } from "react";

/**
 * Phones: a "Book grooming" bar after the hero, hidden while the booking
 * section itself is on screen (no point pointing at what you're looking at).
 */
export default function StickyBookBar({ fromLabel }: { fromLabel: string | null }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.querySelector(".gr-hero");
    const book = document.getElementById("book");
    if (!hero || !book || !("IntersectionObserver" in window)) return;
    let heroVisible = true;
    let bookVisible = false;
    const update = () => setShow(!heroVisible && !bookVisible);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) heroVisible = e.isIntersecting;
        if (e.target === book) bookVisible = e.isIntersecting;
      }
      update();
    });
    io.observe(hero);
    io.observe(book);
    return () => io.disconnect();
  }, []);
  return (
    <div className="gr-sticky" data-show={show || undefined} aria-hidden={!show}>
      <p>
        <strong>Premium grooming</strong>
        {fromLabel && <span> from {fromLabel}</span>}
      </p>
      <a href="#book" className="gr-btn gr-btn--amber gr-btn--sm" tabIndex={show ? 0 : -1}>
        Book grooming
      </a>
    </div>
  );
}
