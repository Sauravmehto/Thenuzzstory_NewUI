import { describe, expect, it } from "vitest";
import seed from "@/data/grooming/pricing.seed.json";
import { addDays, availabilityProblems, availableStarts, coveredSlots, DEFAULT_AVAILABILITY, openSlots, storeNow, weekdayOf } from "@/lib/grooming/availability";
import { browseBreeds, findBreed, searchBreeds } from "@/lib/grooming/breeds";
import { instagramEmbedUrl, parseInstagramUrl } from "@/lib/grooming/instagram";
import { customerToStoreMessage, formatTime } from "@/lib/grooming/messages";
import { estimate, estimateChanged, menuFrom, pricingProblems, sizeBandFor, slotsNeeded } from "@/lib/grooming/pricing";
import type { AvailabilityConfig, GroomingBooking, PricingConfig } from "@/lib/grooming/types";
import { validateBooking, validateContact, validatePet, type BookingRequest } from "@/lib/grooming/validation";
import { whatsappUrl } from "@/lib/whatsapp-order";

const menu = () => {
  const { _source, ...config } = structuredClone(seed) as typeof seed & { _source?: string };
  return config as PricingConfig;
};
const svc = (config: PricingConfig, id: string) => config.services.find((s) => s.id === id)!;

describe("printed grooming menu (seed)", () => {
  it("has exactly the prices on the menu, in paise", () => {
    const c = menu();
    expect(svc(c, "dog-spa").price).toEqual({ type: "by_size", bands: { small: 75000, medium: 85000, large: 100000, giant: 110000 } });
    expect(svc(c, "dog-long-coat").price).toEqual({ type: "by_size", bands: { small: 150000, medium: 170000, large: 200000, giant: 220000 } });
    expect(svc(c, "cat-spa").price).toEqual({ type: "flat", cents: 100000 });
    expect(svc(c, "cat-long-coat").price).toEqual({ type: "flat", cents: 200000 });
    const flat = { "dry-grooming": 65000, maintenance: 34900, "face-trim": 49900, "sanitary-trim": 49900, "massage-classic": 39900, "massage-calming": 49900, "massage-anti-tick-flea": 69900, "massage-skin-coat": 69900 };
    for (const [id, cents] of Object.entries(flat)) expect(svc(c, id).price).toEqual({ type: "flat", cents });
  });

  it("keeps the menu price snapshot equal to the live price, and the Dry Grooming wording verbatim", () => {
    const c = menu();
    for (const s of c.services) expect(s.menuPrice).toEqual(s.price);
    expect(svc(c, "dry-grooming").condition).toBe("(under 3 months puppy & vaccination records required)");
  });

  it("has no invented durations (nothing bookable online until the store sets them)", () => {
    for (const s of menu().services) expect(s.slotsNeeded).toBeNull();
  });

  it("is a valid config, and the cheapest service is ₹349", () => {
    expect(pricingProblems(menu())).toEqual([]);
    expect(menuFrom(menu())).toBe(34900);
  });
});

describe("size bands (on the line = lower band)", () => {
  const bands = menu().sizeBands;
  it.each([
    [0.5, "small"],
    [10, "small"],
    [10.1, "medium"],
    [25, "medium"],
    [25.5, "large"],
    [40, "large"],
    [40.1, "giant"],
    [80, "giant"],
  ])("%s kg → %s", (kg, band) => expect(sizeBandFor(kg, bands)).toBe(band));
  it("rejects nonsense weights", () => {
    expect(sizeBandFor(0, bands)).toBeNull();
    expect(sizeBandFor(Number.NaN, bands)).toBeNull();
  });
});

describe("estimate", () => {
  const c = menu();
  it("one main service, priced by size", () => {
    const r = estimate({ species: "dog", sizeBand: "medium", mainId: "dog-spa", extraIds: [] }, c);
    expect(r).toEqual({ kind: "estimate", estimate: { lines: [{ serviceId: "dog-spa", name: "Dogs Spa Grooming", cents: 85000, role: "main" }], totalCents: 85000 } });
  });

  it("main + extras are added up", () => {
    const r = estimate({ species: "dog", sizeBand: "medium", mainId: "dog-spa", extraIds: ["massage-calming", "face-trim"] }, c);
    expect(r.kind === "estimate" && r.estimate.totalCents).toBe(85000 + 49900 + 49900);
  });

  it("cats: flat prices, size ignored; dog-only packages refused", () => {
    expect(estimate({ species: "cat", mainId: "cat-long-coat", extraIds: ["massage-classic"] }, c)).toMatchObject({ kind: "estimate", estimate: { totalCents: 239900 } });
    expect(estimate({ species: "cat", mainId: "dog-spa", extraIds: [] }, c).kind).toBe("invalid");
  });

  it("a quick service or massage can be the main service", () => {
    expect(estimate({ species: "dog", mainId: "maintenance", extraIds: [] }, c)).toMatchObject({ kind: "estimate", estimate: { totalCents: 34900 } });
  });

  it("refuses packages as extras, the main service as its own extra, and duplicates", () => {
    expect(estimate({ species: "dog", sizeBand: "small", mainId: "maintenance", extraIds: ["dog-spa"] }, c).kind).toBe("invalid");
    expect(estimate({ species: "dog", mainId: "face-trim", extraIds: ["face-trim"] }, c).kind).toBe("invalid");
    expect(estimate({ species: "dog", mainId: "maintenance", extraIds: ["face-trim", "face-trim"] }, c).kind).toBe("invalid");
  });

  it("no size for a sized package → custom quote, not a guessed price", () => {
    expect(estimate({ species: "dog", mainId: "dog-spa", extraIds: [] }, c)).toMatchObject({ kind: "custom_quote" });
  });

  it("a missing band price → custom quote", () => {
    const edited = menu();
    const spa = svc(edited, "dog-spa");
    spa.price = { type: "by_size", bands: { small: 75000 } };
    expect(estimate({ species: "dog", sizeBand: "giant", mainId: "dog-spa", extraIds: [] }, edited).kind).toBe("custom_quote");
  });

  it("inactive services can't be chosen", () => {
    const edited = menu();
    svc(edited, "massage-calming").active = false;
    expect(estimate({ species: "dog", mainId: "massage-calming", extraIds: [] }, edited).kind).toBe("invalid");
  });

  it("detects a changed estimate", () => {
    const a = { lines: [{ serviceId: "dog-spa", name: "x", cents: 85000, role: "main" as const }], totalCents: 85000 };
    expect(estimateChanged(a, structuredClone(a))).toBe(false);
    expect(estimateChanged(a, { ...a, totalCents: 90000, lines: [{ ...a.lines[0]!, cents: 90000 }] })).toBe(true);
    expect(estimateChanged(null, null)).toBe(false);
    expect(estimateChanged(a, null)).toBe(true);
  });

  it("a service with no duration takes one slot; an unknown service does not", () => {
    const edited = menu();
    expect(slotsNeeded({ mainId: "dog-spa", extraIds: [] }, edited)).toBe(1);
    svc(edited, "dog-spa").slotsNeeded = 3;
    svc(edited, "face-trim").slotsNeeded = 1;
    expect(slotsNeeded({ mainId: "dog-spa", extraIds: ["face-trim"] }, edited)).toBe(4);
    expect(slotsNeeded({ mainId: "dog-spa", extraIds: ["maintenance"] }, edited)).toBe(4);
    expect(slotsNeeded({ mainId: "not-a-service", extraIds: [] }, edited)).toBeNull();
  });

  it("config validation catches bad prices and cat services priced by size", () => {
    const edited = menu();
    svc(edited, "face-trim").price = { type: "flat", cents: 0 };
    svc(edited, "massage-classic").price = { type: "by_size", bands: { small: 100 } };
    const problems = pricingProblems(edited);
    expect(problems.some((p) => p.startsWith("Face Trim"))).toBe(true);
    expect(problems.some((p) => p.includes("size prices are by dog weight"))).toBe(true);
  });
});

describe("breeds", () => {
  it("shows the popular Indian list first, in order", () => {
    const { popular } = browseBreeds("dog");
    expect(popular.slice(0, 3).map((b) => b.name)).toEqual(["Labrador Retriever", "Golden Retriever", "German Shepherd"]);
    expect(popular.map((b) => b.name)).toEqual(expect.arrayContaining(["Rajapalayam", "Mudhol Hound", "Kombai", "Chippiparai", "Indian Pariah / Indie"]));
  });

  it.each([
    ["gsd", "German Shepherd"],
    ["alsatian", "German Shepherd"],
    ["lab", "Labrador Retriever"],
    ["desi", "Indian Pariah / Indie"],
    ["shitzu", "Shih Tzu"],
    ["husky", "Siberian Husky"],
    ["Rajap", "Rajapalayam"],
  ])("“%s” finds %s first", (q, name) => expect(searchBreeds("dog", q)[0]!.name).toBe(name));

  it("always offers Other / Not listed, and Mixed Breed exists", () => {
    expect(searchBreeds("dog", "zzzz").map((b) => b.id)).toEqual(["other"]);
    expect(searchBreeds("dog", "mixed")[0]!.name).toBe("Mixed Breed");
    expect(browseBreeds("cat").all.at(-1)!.id).toBe("other");
  });

  it("keeps cats separate", () => {
    expect(searchBreeds("cat", "persian")[0]!.name).toBe("Persian");
    expect(findBreed("cat", "labrador")).toBeUndefined();
    expect(findBreed("dog", "other")!.name).toBe("Other / Not listed");
  });
});

describe("availability", () => {
  // 2026-11-23 is a Monday.
  const cfg = (over: Partial<AvailabilityConfig> = {}): AvailabilityConfig => ({
    ...DEFAULT_AVAILABILITY,
    bookingEnabled: true,
    slotMinutes: 30,
    weekly: { ...DEFAULT_AVAILABILITY.weekly, mon: [{ open: "10:00", close: "13:00" }, { open: "14:00", close: "16:00" }], tue: [{ open: "10:00", close: "12:00" }] },
    capacityPerSlot: 2,
    minNoticeMinutes: 60,
    maxDaysAhead: 30,
    ...over,
  });
  // 06:30 IST on Mon 23 Nov 2026 (01:00 UTC).
  const now = new Date("2026-11-23T01:00:00Z");

  it("knows the store's date and weekday", () => {
    expect(storeNow(now)).toEqual({ date: "2026-11-23", minutes: 390 });
    expect(weekdayOf("2026-11-23")).toBe("mon");
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });

  it("generates slots inside opening hours, skipping the break", () => {
    expect(openSlots("2026-11-23", cfg()).starts).toEqual(["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "14:00", "14:30", "15:00", "15:30"]);
    expect(openSlots("2026-11-25", cfg())).toEqual({ starts: [], closedReason: "Closed" }); // Wednesday
  });

  it("honours holidays, blocked times and capacity overrides", () => {
    expect(openSlots("2026-11-23", cfg({ closedDates: [{ date: "2026-11-23", reason: "Diwali" }] }))).toEqual({ starts: [], closedReason: "Diwali" });
    expect(openSlots("2026-11-23", cfg({ blockedSlots: [{ date: "2026-11-23", start: "11:00", end: "12:00", reason: "" }] })).starts).not.toContain("11:30");
    expect(openSlots("2026-11-24", cfg({ capacityOverrides: [{ date: "2026-11-24", capacity: 0 }] })).starts).toEqual([]);
  });

  it("multi-slot services need consecutive open slots (no crossing the break)", () => {
    const day = availableStarts("2026-11-23", 3, cfg(), new Map(), now);
    expect(day.starts).toContain("11:30");
    expect(day.starts).not.toContain("12:00"); // 12:00, 12:30, 13:00 → 13:00 is the break
    expect(day.starts).toContain("14:00");
    expect(day.starts).not.toContain("15:30");
    expect(coveredSlots("2026-11-23", "11:30", 3, cfg())).toEqual(["11:30", "12:00", "12:30"]);
    expect(coveredSlots("2026-11-23", "12:30", 2, cfg())).toBeNull();
  });

  it("hides slots that are full", () => {
    const taken = new Map([["1100", 2], ["1130", 1]]);
    const day = availableStarts("2026-11-23", 1, cfg(), taken, now);
    expect(day.starts).not.toContain("11:00");
    expect(day.starts).toContain("11:30");
    expect(availableStarts("2026-11-23", 2, cfg(), taken, now).starts).not.toContain("10:30"); // 10:30 + 11:00(full)
  });

  it("applies minimum notice (also across midnight) and the booking window", () => {
    const late = new Date("2026-11-23T08:00:00Z"); // 13:30 IST
    expect(availableStarts("2026-11-23", 1, cfg(), new Map(), late).starts).toEqual(["14:30", "15:00", "15:30"]);
    const night = new Date("2026-11-23T17:30:00Z"); // 23:00 IST Monday, notice 12h → Tue from 11:00
    expect(availableStarts("2026-11-24", 1, cfg({ minNoticeMinutes: 720 }), new Map(), night).starts).toEqual(["11:00", "11:30"]);
    expect(availableStarts("2026-11-22", 1, cfg(), new Map(), now).starts).toEqual([]);
    expect(availableStarts("2027-01-04", 1, cfg(), new Map(), now).starts).toEqual([]); // > 30 days
  });

  it("validates admin settings", () => {
    expect(availabilityProblems(cfg())).toEqual([]);
    expect(availabilityProblems(cfg({ weekly: { ...cfg().weekly, mon: [{ open: "12:00", close: "10:00" }] } })).length).toBeGreaterThan(0);
    expect(availabilityProblems(cfg({ capacityPerSlot: 0 })).length).toBeGreaterThan(0);
  });
});

describe("booking form rules", () => {
  const base: BookingRequest = {
    pet: { species: "dog", name: "Bruno", breedId: "labrador", weightKg: 28 },
    selection: { mainId: "dog-spa", extraIds: [] },
    slot: { date: "2026-11-24", start: "10:00" },
    customer: { name: "Asha Verma", phone: "98765 43210" },
    seen: { estimate: null },
  };
  it("accepts a complete request", () => expect(validateBooking(base)).toEqual({}));
  it("explains each problem", () => {
    expect(validatePet({ species: "dog", name: "", breedId: "" })).toMatchObject({ petName: expect.any(String), breed: expect.any(String) });
    expect(validatePet({ species: "dog", name: "Bruno", breedId: "other" })).toMatchObject({ breedOther: expect.any(String) });
    expect(validatePet({ species: "dog", name: "Bruno", breedId: "labrador", weightKg: 500 })).toMatchObject({ weightKg: expect.any(String) });
    expect(validateContact({ name: "A", phone: "12345", whatsapp: "1", email: "nope" })).toMatchObject({
      name: expect.any(String),
      phone: expect.any(String),
      whatsapp: expect.any(String),
      email: expect.any(String),
    });
    expect(validateBooking({ ...base, slot: { date: "2026-02-30", start: "10:00" } })).toMatchObject({ slot: expect.any(String) });
  });
  it("email and WhatsApp are optional", () => {
    expect(validateContact({ name: "Asha", phone: "9876543210", whatsapp: "", email: "" })).toEqual({});
  });
});

describe("Instagram links", () => {
  it.each([
    ["https://www.instagram.com/reel/C9xYz123AbC/", "reel", "C9xYz123AbC"],
    ["https://instagram.com/reels/C9xYz123AbC?igsh=abc", "reel", "C9xYz123AbC"],
    ["https://www.instagram.com/p/C9xYz123AbC/?img_index=1", "p", "C9xYz123AbC"],
    ["https://www.instagram.com/thenuzzstory/reel/C9xYz123AbC/", "reel", "C9xYz123AbC"],
  ])("%s", (url, kind, shortcode) => expect(parseInstagramUrl(url)).toEqual({ kind, shortcode }));

  it.each(["https://evil.example/reel/abc12/", "javascript:alert(1)", "https://www.instagram.com/thenuzzstory/", "https://www.instagram.com.evil.io/reel/abcde/"])(
    "rejects %s",
    (url) => expect(parseInstagramUrl(url)).toBeNull(),
  );

  it("builds the embed URL itself", () => expect(instagramEmbedUrl("reel", "C9xYz123AbC")).toBe("https://www.instagram.com/reel/C9xYz123AbC/embed/"));
});

describe("WhatsApp text", () => {
  it("formats times and encodes the message once", () => {
    expect(formatTime("09:00")).toBe("9 am");
    expect(formatTime("14:30")).toBe("2:30 pm");
    const booking = {
      bookingId: "GR-261124-ABCDEF",
      pet: { name: "Bruno", breedName: "Labrador Retriever", species: "dog" },
      services: { mainId: "dog-spa", extraIds: ["face-trim"] },
      requested: { date: "2026-11-24", start: "10:00", slots: 2 },
      estimate: { lines: [], totalCents: 134900 },
      customer: { name: "Asha Verma" },
    } as unknown as GroomingBooking;
    const msg = customerToStoreMessage(booking, menu());
    expect(msg).toContain("Dogs Spa Grooming + Face Trim");
    expect(msg).toContain("₹1,349 (estimate)");
    expect(whatsappUrl(msg)).toContain(encodeURIComponent("GR-261124-ABCDEF"));
  });
});
