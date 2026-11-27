import "server-only";
import seed from "@/data/grooming/pricing.seed.json";
import { availabilityProblems, DEFAULT_AVAILABILITY, withShopWeek } from "@/lib/grooming/availability";
import { SAMPLE_GALLERY } from "@/lib/grooming/samples";
import { pricingProblems } from "@/lib/grooming/pricing";
import type { AvailabilityConfig, ContentKind, ContentMap, PricingConfig } from "@/lib/grooming/types";
import { groomingStore, type GroomingStore } from "./grooming-store";

/*
 * Grooming config and content. Until the admin saves something, the printed
 * menu (data/grooming/pricing.seed.json) and the defaults are used; once saved,
 * the stored copy wins. Admin edits on the live site never touch the repo.
 */

const PRICING_KEY = "config/pricing";
const AVAILABILITY_KEY = "config/availability";
const contentKey = (kind: ContentKind) => `content/${kind}`;
const LEGACY_DEFAULT_SLOTS_NEEDED = 1;

/** The printed menu, as a pricing config. */
export function menuPricing(): PricingConfig {
  const { _source: _ignored, ...config } = seed as typeof seed & { _source?: string };
  return structuredClone(config) as PricingConfig;
}

export class ConfigError extends Error {
  constructor(public problems: string[]) {
    super(problems[0] ?? "Invalid settings.");
  }
}

function normalizePricingForRuntime(config: PricingConfig): PricingConfig {
  const allSlotsMissing = config.services.length > 0 && config.services.every((service) => service.slotsNeeded === null);
  if (!allSlotsMissing) return config;
  return {
    ...config,
    services: config.services.map((service) => ({
      ...service,
      // Older menus stored no duration. One slot keeps the calendar able to offer a time.
      slotsNeeded: service.slotsNeeded ?? LEGACY_DEFAULT_SLOTS_NEEDED,
    })),
  };
}

export async function getPricing(store?: GroomingStore): Promise<PricingConfig> {
  const s = store ?? (await groomingStore());
  const pricing = (await s.readJSON<PricingConfig>(PRICING_KEY)) ?? menuPricing();
  return normalizePricingForRuntime(pricing);
}

/** Validates, bumps the version and saves. Returns the saved config. */
export async function savePricing(next: PricingConfig, store?: GroomingStore): Promise<PricingConfig> {
  const problems = pricingProblems(next);
  if (problems.length) throw new ConfigError(problems);
  const s = store ?? (await groomingStore());
  return s.updateJSON<PricingConfig>(PRICING_KEY, (current) => ({
    ...next,
    sections: next.sections.map((sec) => ({ ...sec, inclusions: sec.inclusions.map((l) => l.trim()).filter(Boolean) })),
    version: Math.max(current?.version ?? menuPricing().version, next.version ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  }));
}

export async function getAvailability(store?: GroomingStore): Promise<AvailabilityConfig> {
  const s = store ?? (await groomingStore());
  const saved = await s.readJSON<AvailabilityConfig>(AVAILABILITY_KEY);
  const config = saved ? { ...DEFAULT_AVAILABILITY, ...saved } : structuredClone(DEFAULT_AVAILABILITY);
  return withShopWeek(config);
}

export async function saveAvailability(next: AvailabilityConfig, store?: GroomingStore): Promise<AvailabilityConfig> {
  const problems = availabilityProblems(next);
  if (problems.length) throw new ConfigError(problems);
  const s = store ?? (await groomingStore());
  const saved: AvailabilityConfig = {
    ...next,
    closedDates: [...next.closedDates].sort((a, b) => a.date.localeCompare(b.date)),
    capacityOverrides: [...next.capacityOverrides].sort((a, b) => a.date.localeCompare(b.date)),
    blockedSlots: [...next.blockedSlots].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
    updatedAt: new Date().toISOString(),
  };
  await s.writeJSON(AVAILABILITY_KEY, saved);
  return saved;
}

const DEFAULT_CONTENT: { [K in ContentKind]: ContentMap[K][] } = {
  videos: [],
  gallery: SAMPLE_GALLERY,
  testimonials: [],
};

/** Every item of a kind (admin), in display order. */
export async function listContent<K extends ContentKind>(kind: K, store?: GroomingStore): Promise<ContentMap[K][]> {
  const s = store ?? (await groomingStore());
  const items = (await s.readJSON<ContentMap[K][]>(contentKey(kind))) ?? structuredClone(DEFAULT_CONTENT[kind]);
  return [...items].sort((a, b) => a.order - b.order);
}

/** Published items only (the public page). */
export async function publishedContent<K extends ContentKind>(kind: K, store?: GroomingStore): Promise<ContentMap[K][]> {
  return (await listContent(kind, store)).filter((i) => i.active);
}

/** Read-modify-write of one content list, renumbering `order` to 1..n. */
export async function updateContent<K extends ContentKind>(
  kind: K,
  mutate: (items: ContentMap[K][]) => ContentMap[K][],
  store?: GroomingStore,
): Promise<ContentMap[K][]> {
  const s = store ?? (await groomingStore());
  return s.updateJSON<ContentMap[K][]>(contentKey(kind), (current) => {
    const base = [...(current ?? structuredClone(DEFAULT_CONTENT[kind]))].sort((a, b) => a.order - b.order);
    return mutate(base).map((item, i) => ({ ...item, order: i + 1 }));
  });
}
