"use client";

import { useEffect, type RefObject } from "react";

/**
 * Pointer-driven hero effects, on devices with a real mouse and motion OK:
 *  - a soft spotlight that follows the cursor (--mx / --my on the stage)
 *  - 3D tilt + a moving glare on the side cards (--rx / --ry / --gx / --gy)
 *
 * One rAF-throttled listener per element, CSS variables only, so React
 * never re-renders while the mouse moves.
 */
export function useHeroPointer(stageRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const query = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    if (!query.matches) return;

    const cleanups: Array<() => void> = [];

    const track = (el: HTMLElement, apply: (x: number, y: number, r: DOMRect) => void, reset: () => void) => {
      let frame = 0;
      let last: PointerEvent | null = null;
      const onMove = (e: PointerEvent) => {
        last = e;
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (!last) return;
          const r = el.getBoundingClientRect();
          apply(last.clientX - r.left, last.clientY - r.top, r);
        });
      };
      const onLeave = () => {
        cancelAnimationFrame(frame);
        frame = 0;
        reset();
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
      cleanups.push(() => {
        cancelAnimationFrame(frame);
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerleave", onLeave);
      });
    };

    // Spotlight on the whole stage.
    track(
      stage,
      (x, y) => {
        stage.style.setProperty("--mx", `${x}px`);
        stage.style.setProperty("--my", `${y}px`);
        stage.dataset.spot = "on";
      },
      () => delete stage.dataset.spot,
    );

    // Tilt + glare on each side card (applied to the image frame, because the
    // card itself carries the slide-in animation's transform).
    stage.querySelectorAll<HTMLElement>("[data-tilt]").forEach((card) => {
      track(
        card,
        (x, y, r) => {
          const px = x / r.width - 0.5; // -0.5 … 0.5
          const py = y / r.height - 0.5;
          card.style.setProperty("--ry", `${(px * 14).toFixed(2)}deg`);
          card.style.setProperty("--rx", `${(-py * 14).toFixed(2)}deg`);
          card.style.setProperty("--gx", `${(x / r.width) * 100}%`);
          card.style.setProperty("--gy", `${(y / r.height) * 100}%`);
        },
        () => {
          card.style.setProperty("--rx", "0deg");
          card.style.setProperty("--ry", "0deg");
        },
      );
    });

    return () => cleanups.forEach((fn) => fn());
  }, [stageRef]);
}
