"use client";

// ─── useScrollReveal — reveal [data-reveal] elements as they enter view ──────
// Uses an IntersectionObserver that only toggles the `.is-revealed` class (the
// fade/slide-up itself is a CSS transition). This deliberately avoids GSAP/
// ScrollTrigger here: those mutate/refresh the DOM outside React's control, and
// when a list re-renders (e.g. filtering or searching the shop) React and GSAP
// race over the same nodes and throw "removeChild is not a child of this node".
// A class toggle never reparents or removes nodes, so it's safe across
// re-renders. Optional `data-reveal-delay` (seconds) staggers items.
// Only elements inside `rootRef` are observed.

import { useEffect } from "react";

export function useScrollReveal(rootRef, deps = []) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll("[data-reveal]"));
    if (!els.length) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-revealed"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const delay = parseFloat(el.dataset.revealDelay || "0");
          if (delay) el.style.transitionDelay = `${delay}s`;
          el.classList.add("is-revealed");
          obs.unobserve(el);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
