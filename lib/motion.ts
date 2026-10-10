/**
 * Single source of truth for the user's motion preference.
 * Decorative motion (wiggles, marquees, physics, custom cursor) is skipped
 * when this is true; functional transitions stay but become instant/fades.
 */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
