import type { Cents } from "@/lib/types";
import {
  SIZE_BANDS,
  type Estimate,
  type EstimateLine,
  type GroomingService,
  type PricingConfig,
  type ServicePrice,
  type ServiceSelection,
  type SizeBand,
  type SizeBandDef,
  type Species,
} from "./types";

/*
 * The grooming price engine. Pure: the same functions run in the browser (for
 * the live estimate) and on the server (which re-prices every booking request
 * from its own config and never trusts a price sent by the browser).
 */

/** Size band for a weight. On the line counts as the lower band: 10 kg = small, 25 kg = medium, 40 kg = large. */
export function sizeBandFor(kg: number, bands: readonly SizeBandDef[]): SizeBand | null {
  if (!Number.isFinite(kg) || kg <= 0) return null;
  const sorted = [...bands].sort((a, b) => (a.maxKg ?? Infinity) - (b.maxKg ?? Infinity));
  for (const band of sorted) if (band.maxKg === null || kg <= band.maxKg) return band.id;
  return null;
}

export const isBookableFor = (service: GroomingService, species: Species) => service.active && service.species.includes(species);

/** Active services this species can have, in display order. */
export function servicesFor(config: PricingConfig, species: Species): GroomingService[] {
  return config.services.filter((s) => isBookableFor(s, species)).sort((a, b) => a.order - b.order);
}

export function priceFor(price: ServicePrice, sizeBand: SizeBand | null | undefined): Cents | null {
  if (price.type === "flat") return price.cents;
  if (!sizeBand) return null;
  return price.bands[sizeBand] ?? null;
}

/** "₹750" for a flat price, the lowest band for a sized one (for "from ₹750"). */
export function lowestPrice(price: ServicePrice): Cents | null {
  if (price.type === "flat") return price.cents;
  const values = Object.values(price.bands).filter((v): v is Cents => typeof v === "number");
  return values.length ? Math.min(...values) : null;
}

export const samePrice = (a: ServicePrice, b: ServicePrice) =>
  a.type === b.type &&
  (a.type === "flat"
    ? a.cents === (b as typeof a).cents
    : SIZE_BANDS.every((band) => a.bands[band] === (b as typeof a).bands[band]));

/** The lowest price anywhere on the menu ("from ₹349"). */
export function menuFrom(config: PricingConfig): Cents | null {
  const prices = config.services.filter((s) => s.active).map((s) => lowestPrice(s.price)).filter((v): v is Cents => v !== null);
  return prices.length ? Math.min(...prices) : null;
}

export type SelectionProblem =
  | { field: "mainId"; message: string }
  | { field: "extraIds"; message: string }
  | { field: "sizeBand"; message: string };

/** Structural checks: the services exist, are active, fit the species and can be combined. */
export function checkSelection(sel: ServiceSelection, config: PricingConfig): SelectionProblem | null {
  const byId = new Map(config.services.map((s) => [s.id, s]));
  const main = byId.get(sel.mainId);
  if (!main || !isBookableFor(main, sel.species)) return { field: "mainId", message: "Choose a grooming service." };
  if (new Set(sel.extraIds).size !== sel.extraIds.length) return { field: "extraIds", message: "Each extra can only be added once." };
  if (sel.extraIds.length > 8) return { field: "extraIds", message: "That's a lot of extras: please call us for a custom plan." };
  for (const id of sel.extraIds) {
    const extra = byId.get(id);
    if (!extra || !isBookableFor(extra, sel.species) || extra.role !== "main_or_extra" || id === sel.mainId)
      return { field: "extraIds", message: "One of the extras can't be added to this service." };
  }
  return null;
}

export type EstimateResult =
  | { kind: "estimate"; estimate: Estimate }
  /** No reliable price for this combination: book anyway, the team quotes on the call. */
  | { kind: "custom_quote"; reason: string }
  | { kind: "invalid"; problem: SelectionProblem };

export function estimate(sel: ServiceSelection, config: PricingConfig): EstimateResult {
  const problem = checkSelection(sel, config);
  if (problem) return { kind: "invalid", problem };
  const byId = new Map(config.services.map((s) => [s.id, s]));
  const lines: EstimateLine[] = [];
  for (const [id, role] of [[sel.mainId, "main"], ...sel.extraIds.map((e) => [e, "extra"])] as [string, EstimateLine["role"]][]) {
    const service = byId.get(id)!;
    const cents = priceFor(service.price, sel.sizeBand);
    if (cents === null) {
      return service.price.type === "by_size" && !sel.sizeBand
        ? { kind: "custom_quote", reason: "Add your pet's weight to see the price for their size." }
        : { kind: "custom_quote", reason: `We don't have a fixed price for ${service.name} for this pet yet. We'll quote it on the call.` };
    }
    lines.push({ serviceId: id, name: service.name, cents, role });
  }
  return { kind: "estimate", estimate: { lines, totalCents: lines.reduce((sum, l) => sum + l.cents, 0) } };
}

/** Calendar slots the selection needs. A service with no duration set takes one slot. Null when a chosen id isn't on the menu. */
export function slotsNeeded(sel: Pick<ServiceSelection, "mainId" | "extraIds">, config: PricingConfig): number | null {
  const byId = new Map(config.services.map((s) => [s.id, s]));
  let total = 0;
  for (const id of [sel.mainId, ...sel.extraIds]) {
    const service = byId.get(id);
    if (!service) return null;
    const n = service.slotsNeeded;
    total += n && n >= 1 ? n : 1;
  }
  return total;
}

/** True when the estimate the customer saw no longer matches the server's. */
export function estimateChanged(seen: Estimate | null, actual: Estimate | null): boolean {
  if (seen === null || actual === null) return seen !== actual;
  if (seen.totalCents !== actual.totalCents || seen.lines.length !== actual.lines.length) return true;
  return seen.lines.some((l, i) => l.serviceId !== actual.lines[i]!.serviceId || l.cents !== actual.lines[i]!.cents);
}

// ---- validation of an edited config (admin) -------------------------------------

const ID_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;
const isCents = (v: unknown): v is Cents => Number.isInteger(v) && (v as number) > 0 && (v as number) <= 10_000_000;

function checkPrice(p: unknown, where: string): string | null {
  if (typeof p !== "object" || p === null) return `${where}: price is missing.`;
  const price = p as ServicePrice;
  if (price.type === "flat") return isCents(price.cents) ? null : `${where}: enter a price above ₹0.`;
  if (price.type === "by_size") {
    const values = Object.entries(price.bands ?? {});
    if (values.length === 0) return `${where}: enter at least one size price.`;
    for (const [band, cents] of values) {
      if (!(SIZE_BANDS as readonly string[]).includes(band)) return `${where}: unknown size "${band}".`;
      if (!isCents(cents)) return `${where}: every size price must be above ₹0.`;
    }
    return null;
  }
  return `${where}: unknown price type.`;
}

/** Problems with a pricing config, as readable sentences (empty = valid). */
export function pricingProblems(config: PricingConfig): string[] {
  const problems: string[] = [];
  if (!Array.isArray(config.sizeBands) || config.sizeBands.length !== SIZE_BANDS.length) problems.push("All four size bands are required.");
  else {
    const maxes = config.sizeBands.map((b) => b.maxKg);
    if (maxes.filter((m) => m === null).length !== 1) problems.push("Exactly one size band (the largest) has no upper weight.");
    const finite = maxes.filter((m): m is number => m !== null);
    if (finite.some((m) => !(m > 0 && m < 200))) problems.push("Size band weights must be between 0 and 200 kg.");
    if (new Set(finite).size !== finite.length) problems.push("Size band weights must all be different.");
    for (const b of config.sizeBands) if (!b.label?.trim()) problems.push(`Size band "${b.id}" needs a label.`);
  }
  const sectionIds = new Set<string>();
  for (const s of config.sections ?? []) {
    if (!ID_RE.test(s.id) || sectionIds.has(s.id)) problems.push(`Section id "${s.id}" is invalid or repeated.`);
    sectionIds.add(s.id);
    if (!s.title?.trim()) problems.push("Every section needs a title.");
  }
  const serviceIds = new Set<string>();
  for (const s of config.services ?? []) {
    const where = s.name?.trim() || s.id || "A service";
    if (!ID_RE.test(s.id) || serviceIds.has(s.id)) problems.push(`${where}: id "${s.id}" is invalid or repeated.`);
    serviceIds.add(s.id);
    if (!s.name?.trim()) problems.push(`${where}: name is required.`);
    if (s.name && s.name.length > 80) problems.push(`${where}: keep the name under 80 characters.`);
    if ((s.description ?? "").length > 1200) problems.push(`${where}: keep the description under 1200 characters.`);
    if (!sectionIds.has(s.sectionId)) problems.push(`${where}: choose a section.`);
    if (!Array.isArray(s.species) || s.species.length === 0 || s.species.some((x) => x !== "dog" && x !== "cat"))
      problems.push(`${where}: choose dogs, cats or both.`);
    if (s.role !== "main_only" && s.role !== "main_or_extra") problems.push(`${where}: choose whether it can be an extra.`);
    const priceProblem = checkPrice(s.price, where);
    if (priceProblem) problems.push(priceProblem);
    if (s.price?.type === "by_size" && s.species?.includes("cat"))
      problems.push(`${where}: size prices are by dog weight; use a single price for a service cats can book.`);
    if (s.slotsNeeded !== null && !(Number.isInteger(s.slotsNeeded) && s.slotsNeeded >= 1 && s.slotsNeeded <= 32))
      problems.push(`${where}: duration must be 1–32 slots, or left empty.`);
  }
  return problems;
}
