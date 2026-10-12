import { useEffect, type RefObject } from "react";
import { prefersReducedMotion } from "../motion";

/**
 * Buttons lean a few pixels toward the cursor, then spring back.
 * Desktop pointers only; skipped for touch and reduced motion.
 */
export function useMagnetic(ref: RefObject<HTMLElement | null>, strength = 0.25, max = 10) {
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let frame = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = Math.max(-max, Math.min(max, (e.clientX - (r.left + r.width / 2)) * strength));
      const y = Math.max(-max, Math.min(max, (e.clientY - (r.top + r.height / 2)) * strength));
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.translate = `${x}px ${y}px`;
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      el.style.translate = "0 0";
    };
    el.style.transition = "translate var(--dur-base) var(--ease-spring)";
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.style.translate = "";
    };
  }, [ref, strength, max]);
}
