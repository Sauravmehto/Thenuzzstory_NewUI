"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export default function SmoothScroll() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    // Don't re-run every ScrollTrigger refresh when the mobile URL bar
    // shows/hides — that "resize" made pinned sections jump mid-scroll.
    ScrollTrigger.config({ ignoreMobileResize: true });

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let lenis = null;
    if (!reducedMotion) {
      lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        // 1 = native touch speed; amplifying it made phone/tablet
        // scrolling feel slippery and out of sync with the finger.
        touchMultiplier: 1,
      });

      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add((time) => {
        lenis.raf(time * 1000);
      });
      gsap.ticker.lagSmoothing(0);
    }

    const originalTitle = document.title;
    const handleVisibility = () => {
      document.title = document.hidden
        ? "Hey, come back! 🐾 - The Nuzz Story"
        : originalTitle;
    };
    document.addEventListener("visibilitychange", handleVisibility);

    if (lenis) window.__lenis = lenis;

    return () => {
      if (lenis) lenis.destroy();
      document.removeEventListener("visibilitychange", handleVisibility);
      delete window.__lenis;
    };
  }, []);

  return null;
}
