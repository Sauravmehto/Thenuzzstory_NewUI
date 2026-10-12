import { prefersReducedMotion } from "./motion";

/**
 * Flies a copy of a product image into the cart icon, then gives the icon a
 * little "caught it" bounce. Resolves when the image lands, so the caller can
 * open the drawer afterwards instead of covering the icon mid-flight.
 *
 * Uses the Web Animations API on a throwaway clone (not GSAP): nothing React
 * renders is touched, so there's no fight with reconciliation, and it cleans
 * itself up. Skipped entirely for reduced-motion users.
 */
export function flyToCart(source: HTMLElement | null, target: HTMLElement | null): Promise<void> {
  if (!source || !target || prefersReducedMotion()) return Promise.resolve();

  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (from.width === 0 || to.width === 0) return Promise.resolve();

  const size = Math.min(from.width, from.height, 160);
  const startX = from.left + from.width / 2 - size / 2;
  const startY = from.top + from.height / 2 - size / 2;
  const dx = to.left + to.width / 2 - (startX + size / 2);
  const dy = to.top + to.height / 2 - (startY + size / 2);

  // Outer element moves on X (linear), inner on Y (eased): together they draw an arc.
  const outer = document.createElement("div");
  outer.setAttribute("aria-hidden", "true");
  Object.assign(outer.style, {
    position: "fixed",
    left: `${startX}px`,
    top: `${startY}px`,
    width: `${size}px`,
    height: `${size}px`,
    zIndex: "1100",
    pointerEvents: "none",
  });
  const inner = document.createElement("div");
  const src = source instanceof HTMLImageElement ? source.currentSrc || source.src : "";
  Object.assign(inner.style, {
    width: "100%",
    height: "100%",
    borderRadius: "1rem",
    backgroundImage: src ? `url("${src}")` : "",
    backgroundColor: "#f9c619",
    backgroundSize: "cover",
    backgroundPosition: "center",
    boxShadow: "0 12px 30px rgba(26, 61, 26, 0.25)",
  });
  outer.appendChild(inner);
  document.body.appendChild(outer);

  const duration = 650;
  const endScale = Math.max(0.12, 28 / size);
  outer.animate([{ transform: "translateX(0)" }, { transform: `translateX(${dx}px)` }], {
    duration,
    easing: "linear",
    fill: "forwards",
  });
  const flight = inner.animate(
    [
      { transform: "translateY(0) scale(1)", opacity: 1, borderRadius: "1rem" },
      { transform: `translateY(${Math.min(dy, 0) - 60}px) scale(0.55)`, opacity: 1, offset: 0.35 },
      { transform: `translateY(${dy}px) scale(${endScale})`, opacity: 0.6, borderRadius: "50%" },
    ],
    { duration, easing: "cubic-bezier(0.5, 0, 0.75, 0)", fill: "forwards" },
  );

  return flight.finished
    .catch(() => undefined)
    .then(() => {
      outer.remove();
      target.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.18) rotate(-8deg)" }, { transform: "scale(1)" }],
        { duration: 380, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
    });
}
