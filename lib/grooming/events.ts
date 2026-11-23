import type { Species } from "./types";

/**
 * "Book this" buttons in the price list hand the choice to the booking flow
 * (a separate component further down the page) through one window event.
 */
export const SELECT_EVENT = "grooming:select-service";

export interface SelectDetail {
  serviceId: string;
  species: Species;
}

export function requestService(detail: SelectDetail) {
  window.dispatchEvent(new CustomEvent<SelectDetail>(SELECT_EVENT, { detail }));
  document.getElementById("book")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
