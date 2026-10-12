"use client";

import { prefersReducedMotion } from "./motion";

/*
 * Shared-element navigation with the View Transitions API.
 *
 * The clicked product photo gets a `view-transition-name`; the product page's
 * main photo has the same name, so the browser morphs one into the other.
 * Next's router is async, so we hand the browser a promise that resolves once
 * the new page has actually rendered (see <ViewTransitionListener />).
 *
 * Unsupported browsers and reduced-motion users get a normal navigation.
 */

let resolvePending: (() => void) | null = null;

/** Called by <ViewTransitionListener /> after every route change has painted. */
export function routeRendered() {
  resolvePending?.();
  resolvePending = null;
}

type StartViewTransition = (cb: () => Promise<void>) => { finished: Promise<void> };

export function navigateWithTransition(
  push: () => void,
  shared?: { element: HTMLElement | null; name: string },
): boolean {
  const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
  if (!start || prefersReducedMotion()) return false;

  if (shared?.element) shared.element.style.viewTransitionName = shared.name;
  document.documentElement.dataset.vt = "1";

  const transition = start.call(document, () =>
    new Promise<void>((resolve) => {
      resolvePending = resolve;
      push();
      window.setTimeout(resolve, 1500); // never leave the page frozen
    }),
  );
  void transition.finished.finally(() => {
    if (shared?.element) shared.element.style.viewTransitionName = "";
    delete document.documentElement.dataset.vt;
  });
  return true;
}

/** True for clicks that should open a new tab/window instead of navigating here. */
export const isModifiedClick = (e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; button: number }) =>
  e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
