import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import seed from "@/data/grooming/pricing.seed.json";
import { DEFAULT_AVAILABILITY } from "@/lib/grooming/availability";
import { estimate } from "@/lib/grooming/pricing";
import type { AvailabilityConfig, Estimate, PricingConfig } from "@/lib/grooming/types";
import type { BookingRequest } from "@/lib/grooming/validation";
import {
  applyAdminAction,
  availabilityFor,
  bookingForToken,
  BOOKING_ID_RE,
  createBooking,
  getBooking,
  listBookings,
  publicBooking,
  takenOn,
} from "@/lib/server/grooming-bookings";
import { getPricing } from "@/lib/server/grooming-config";
import { fileGroomingStore, memoryGroomingStore, type GroomingStore } from "@/lib/server/grooming-store";

const NOW = new Date("2026-11-23T01:00:00Z"); // Mon 06:30 IST
const DAY = "2026-11-24"; // Tuesday

function pricing(): PricingConfig {
  const { _source, ...config } = structuredClone(seed) as typeof seed & { _source?: string };
  const c = config as PricingConfig;
  for (const s of c.services) s.slotsNeeded = 1;
  c.services.find((s) => s.id === "dog-spa")!.slotsNeeded = 2;
  return c;
}

const availability = (over: Partial<AvailabilityConfig> = {}): AvailabilityConfig => ({
  ...DEFAULT_AVAILABILITY,
  bookingEnabled: true,
  slotMinutes: 30,
  weekly: { ...DEFAULT_AVAILABILITY.weekly, tue: [{ open: "10:00", close: "13:00" }], wed: [{ open: "10:00", close: "13:00" }] },
  capacityPerSlot: 2,
  minNoticeMinutes: 60,
  ...over,
});

function request(over: Partial<BookingRequest> = {}, start = "10:00", mainId = "maintenance"): BookingRequest {
  const p = pricing();
  const sel = { species: "dog" as const, sizeBand: "large" as const, mainId, extraIds: [] as string[] };
  const est = estimate(sel, p);
  return {
    pet: { species: "dog", name: "Bruno", breedId: "labrador", weightKg: 30 },
    selection: { mainId, extraIds: [] },
    slot: { date: DAY, start },
    customer: { name: "Asha Verma", phone: "98765 43210" },
    seen: { estimate: est.kind === "estimate" ? est.estimate : null },
    ...over,
  };
}

const create = (store: GroomingStore, req: BookingRequest, over: { availability?: AvailabilityConfig; key?: string } = {}) =>
  createBooking(store, { request: req, pricing: pricing(), availability: over.availability ?? availability(), idempotencyKey: over.key, now: NOW });

describe("creating a booking", () => {
  it("normalizes legacy all-null durations so booking can proceed", async () => {
    const store = memoryGroomingStore(async () => undefined);
    const legacy = pricing();
    for (const service of legacy.services) service.slotsNeeded = null;
    await store.writeJSON("config/pricing", legacy);

    const normalized = await getPricing(store);
    expect(normalized.services.every((service) => service.slotsNeeded === 1)).toBe(true);

    const res = await createBooking(store, { request: request(), pricing: normalized, availability: availability(), now: NOW });
    expect(res.ok).toBe(true);
  });

  it("keeps mixed duration configs unchanged when at least one duration is set", async () => {
    const store = memoryGroomingStore(async () => undefined);
    const mixed = pricing();
    for (const service of mixed.services) service.slotsNeeded = null;
    mixed.services.find((service) => service.id === "maintenance")!.slotsNeeded = 2;
    await store.writeJSON("config/pricing", mixed);

    const normalized = await getPricing(store);
    expect(normalized.services.find((service) => service.id === "maintenance")!.slotsNeeded).toBe(2);
    expect(normalized.services.some((service) => service.id !== "maintenance" && service.slotsNeeded === null)).toBe(true);
  });

  it("saves it as PENDING CONFIRMATION with a price snapshot, and takes the slot", async () => {
    const store = memoryGroomingStore(async () => undefined);
    const res = await create(store, request({}, "10:00", "dog-spa"));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.booking.bookingId).toMatch(BOOKING_ID_RE);
    expect(res.booking).toMatchObject({
      status: "pending_confirmation",
      estimate: { totalCents: 100000 }, // Large dog (30 kg) spa
      pet: { sizeBand: "large", breedName: "Labrador Retriever" },
      requested: { date: DAY, start: "10:00", slots: 2 },
      customer: { phone: "9876543210", whatsapp: "9876543210" },
    });
    expect(res.booking.claims).toHaveLength(2);
    expect(Object.fromEntries(await takenOn(store, DAY))).toEqual({ "1000": 1, "1030": 1 });
    expect(res.token).toBeTruthy();
    expect(await bookingForToken(store, res.booking.bookingId, res.token)).not.toBeNull();
    expect(await bookingForToken(store, res.booking.bookingId, "wrong-token")).toBeNull();
    expect(publicBooking(res.booking)).not.toHaveProperty("customer");
  });

  it("re-prices on the server: a stale estimate is refused with the new one", async () => {
    const store = memoryGroomingStore(async () => undefined);
    const stale: Estimate = { lines: [{ serviceId: "maintenance", name: "Maintenance", cents: 100, role: "main" }], totalCents: 100 };
    const res = await create(store, request({ seen: { estimate: stale } }));
    expect(res).toMatchObject({ ok: false, code: "quote_changed", estimate: { totalCents: 34900 } });
    expect(await listBookings(store)).toHaveLength(0);
  });

  it("refuses when booking is off or a service has no duration", async () => {
    const store = memoryGroomingStore(async () => undefined);
    expect(await create(store, request(), { availability: availability({ bookingEnabled: false }) })).toMatchObject({ ok: false, code: "booking_closed" });
    const p = pricing();
    p.services.find((s) => s.id === "maintenance")!.slotsNeeded = null;
    const res = await createBooking(store, { request: request(), pricing: p, availability: availability(), now: NOW });
    expect(res).toMatchObject({ ok: false, code: "booking_closed" });
  });

  it("refuses closed days, past times and invalid fields", async () => {
    const store = memoryGroomingStore(async () => undefined);
    expect(await create(store, request({ slot: { date: "2026-11-26", start: "10:00" } }))).toMatchObject({ code: "slot_unavailable" }); // Thursday closed
    expect(await create(store, request({ slot: { date: "2026-11-22", start: "10:00" } }))).toMatchObject({ code: "slot_unavailable" });
    expect(await create(store, request({ customer: { name: "", phone: "1" } }))).toMatchObject({ code: "validation" });
  });

  it("the same Idempotency-Key returns the same booking (double click)", async () => {
    const store = memoryGroomingStore();
    const [a, b] = await Promise.all([create(store, request(), { key: "key-12345678" }), create(store, request(), { key: "key-12345678" })]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.booking.bookingId).toBe(b.booking.bookingId);
    expect(a.token).toBe(b.token);
    expect(await listBookings(store)).toHaveLength(1);
    expect(Object.fromEntries(await takenOn(store, DAY))).toEqual({ "1000": 1 });
    const changed = await create(store, request({ pet: { species: "dog", name: "Other pet", breedId: "pug" } }), { key: "key-12345678" });
    expect(changed).toMatchObject({ ok: false, code: "idempotency_conflict" });
  });
});

describe("no overbooking under concurrency", () => {
  it("a double click on the LAST seat returns the same booking to both clicks (no false 'slot taken')", async () => {
    const store = memoryGroomingStore();
    const one = availability({ capacityPerSlot: 1 });
    const results = await Promise.all(Array.from({ length: 4 }, () => create(store, request(), { availability: one, key: "same-key-123456" })));
    expect(results.every((r) => r.ok)).toBe(true);
    const ids = new Set(results.map((r) => (r.ok ? r.booking.bookingId : "")));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.ok && !r.replay)).toHaveLength(1);
    expect(Object.fromEntries(await takenOn(store, DAY))).toEqual({ "1000": 1 });
  });

  it("a failed request releases its key, so a retry with the same key can succeed", async () => {
    const store = memoryGroomingStore(async () => undefined);
    const one = availability({ capacityPerSlot: 1 });
    const blocker = await create(store, request({ customer: { name: "First", phone: "9876500009" } }), { availability: one });
    expect(blocker.ok).toBe(true);
    const failed = await create(store, request(), { availability: one, key: "retry-key-1234" });
    expect(failed).toMatchObject({ ok: false, code: "slot_unavailable" });
    if (blocker.ok) await applyAdminAction(store, blocker.booking.bookingId, { action: "cancel", reason: "freed" }, one, NOW);
    expect((await create(store, request(), { availability: one, key: "retry-key-1234" })).ok).toBe(true);
  });

  it("20 simultaneous requests for a 2-seat slot: exactly 2 succeed, nothing left behind", async () => {
    const store = memoryGroomingStore();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => create(store, request({ customer: { name: `Customer ${i}`, phone: `98765 432${String(i).padStart(2, "0")}` } }))),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.filter((r) => !r.ok && r.code === "slot_unavailable")).toHaveLength(18);
    expect(Object.fromEntries(await takenOn(store, DAY))).toEqual({ "1000": 2 });
    expect(await listBookings(store)).toHaveLength(2);
  });

  it("multi-slot bookings competing for overlapping slots never exceed capacity in any slot", async () => {
    const store = memoryGroomingStore();
    const one = availability({ capacityPerSlot: 1 });
    const starts = ["10:00", "10:30", "11:00", "10:00", "10:30", "11:00", "11:30", "12:00"];
    await Promise.all(starts.map((s, i) => create(store, request({ customer: { name: `C ${i}`, phone: `98765 400${String(i).padStart(2, "0")}` } }, s, "dog-spa"), { availability: one })));
    const taken = await takenOn(store, DAY);
    for (const n of taken.values()) expect(n).toBeLessThanOrEqual(1);
    const bookings = await listBookings(store);
    const claimKeys = bookings.flatMap((b) => b.claims);
    expect(new Set(claimKeys).size).toBe(claimKeys.length);
    expect([...taken.values()].reduce((a, b) => a + b, 0)).toBe(claimKeys.length); // no orphaned claims
  });

  it("the calendar hides a full slot", async () => {
    const store = memoryGroomingStore(async () => undefined);
    await create(store, request());
    await create(store, request({ customer: { name: "Second", phone: "9876500000" } }));
    const [day] = await availabilityFor(store, availability(), [DAY], 1, NOW);
    expect(day!.starts).not.toContain("10:00");
    expect(day!.starts).toContain("10:30");
  });

  it("a stale orphaned claim (crash before the booking was saved) is reclaimed", async () => {
    const store = memoryGroomingStore(async () => undefined);
    const one = availability({ capacityPerSlot: 1 });
    await store.createJSON(`claims/${DAY}/1000/1`, { bookingId: "GR-261123-ZZZZZZ", at: "2026-11-22T00:00:00.000Z" });
    const res = await create(store, request(), { availability: one });
    expect(res.ok).toBe(true);
  });
});

describe("admin decisions", () => {
  async function booked(store: GroomingStore, start = "10:00", mainId = "maintenance") {
    const res = await create(store, request({}, start, mainId));
    if (!res.ok) throw new Error("setup failed");
    return res.booking;
  }

  it("confirm → complete, with history and notes", async () => {
    const store = memoryGroomingStore(async () => undefined);
    const b = await booked(store);
    const confirmed = await applyAdminAction(store, b.bookingId, { action: "confirm", note: "Called, all good" }, availability(), NOW);
    expect(confirmed).toMatchObject({ ok: true, booking: { status: "confirmed", adminNotes: [{ text: "Called, all good" }] } });
    const done = await applyAdminAction(store, b.bookingId, { action: "complete" }, availability(), NOW);
    expect(done.ok && done.booking.history.map((h) => h.action)).toEqual(["created", "confirm", "complete"]);
    expect(Object.fromEntries(await takenOn(store, DAY))).toEqual({ "1000": 1 }); // completed keeps its slot
  });

  it("refuses invalid moves", async () => {
    const store = memoryGroomingStore(async () => undefined);
    const b = await booked(store);
    expect(await applyAdminAction(store, b.bookingId, { action: "complete" }, availability(), NOW)).toMatchObject({ ok: false, code: "invalid_transition" });
    await applyAdminAction(store, b.bookingId, { action: "reject", reason: "No groomer" }, availability(), NOW);
    expect(await applyAdminAction(store, b.bookingId, { action: "confirm" }, availability(), NOW)).toMatchObject({ ok: false, code: "invalid_transition" });
    expect(await applyAdminAction(store, "GR-000000-AAAAAA", { action: "confirm" }, availability(), NOW)).toMatchObject({ ok: false, status: 404 });
  });

  it("cancel and reject need a reason and free the slot", async () => {
    const store = memoryGroomingStore(async () => undefined);
    const b = await booked(store);
    expect(await applyAdminAction(store, b.bookingId, { action: "cancel", reason: " " }, availability(), NOW)).toMatchObject({ ok: false, code: "reason_required" });
    const res = await applyAdminAction(store, b.bookingId, { action: "cancel", reason: "Customer travelling" }, availability(), NOW);
    expect(res).toMatchObject({ ok: true, booking: { status: "cancelled" } });
    expect((await takenOn(store, DAY)).size).toBe(0);
  });

  it("reschedule moves the seats, keeps the original request in history", async () => {
    const store = memoryGroomingStore(async () => undefined);
    const b = await booked(store, "10:00", "dog-spa"); // 10:00 + 10:30
    const res = await applyAdminAction(store, b.bookingId, { action: "reschedule", date: DAY, start: "10:30", note: "Asked for later" }, availability({ capacityPerSlot: 1 }), NOW);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.booking).toMatchObject({ rescheduled: true, requested: { start: "10:00" }, appointment: { start: "10:30", slots: 2 } });
    expect(res.booking.history.at(-1)).toMatchObject({ action: "reschedule", previousSlot: { start: "10:00" }, slot: { start: "10:30" } });
    expect(Object.fromEntries(await takenOn(store, DAY))).toEqual({ "1030": 1, "1100": 1 });
    const stored = await getBooking(store, b.bookingId);
    expect(stored!.claims).toHaveLength(2);
  });

  it("reschedule into a full slot fails and keeps the old appointment", async () => {
    const store = memoryGroomingStore(async () => undefined);
    const one = availability({ capacityPerSlot: 1 });
    const a = await create(store, request({}, "10:00"), { availability: one });
    const b = await create(store, request({ customer: { name: "Other", phone: "9876500001" } }, "11:00"), { availability: one });
    if (!a.ok || !b.ok) throw new Error("setup");
    const res = await applyAdminAction(store, a.booking.bookingId, { action: "reschedule", date: DAY, start: "11:00" }, one, NOW);
    expect(res).toMatchObject({ ok: false, code: "slot_unavailable" });
    expect((await getBooking(store, a.booking.bookingId))!.appointment.start).toBe("10:00");
    expect(Object.fromEntries(await takenOn(store, DAY))).toEqual({ "1000": 1, "1100": 1 });
  });

  it("logs WhatsApp links as opened, not sent", async () => {
    const store = memoryGroomingStore(async () => undefined);
    const b = await booked(store);
    const res = await applyAdminAction(store, b.bookingId, { action: "whatsapp_opened", template: "confirmed" }, availability(), NOW);
    expect(res.ok && res.booking.whatsappLog).toEqual([{ at: NOW.toISOString(), template: "confirmed", delivery: "opened" }]);
  });

  it("confirm keeps booking confirmed even when WhatsApp auto-send isn't configured", async () => {
    const store = memoryGroomingStore(async () => undefined);
    const b = await booked(store);
    const res = await applyAdminAction(store, b.bookingId, { action: "confirm" }, availability(), NOW);
    expect(res).toMatchObject({ ok: true, booking: { status: "confirmed" }, whatsappSent: false });
  });

  it("can run a test WhatsApp send without changing booking status", async () => {
    const store = memoryGroomingStore(async () => undefined);
    const b = await booked(store);
    const res = await applyAdminAction(store, b.bookingId, { action: "send_test_whatsapp", phone: "98765 43210" }, availability(), NOW);
    expect(res).toMatchObject({ ok: true, booking: { status: "pending_confirmation" }, whatsappSent: false });
    if (!res.ok) return;
    expect(res.booking.whatsappLog.at(-1)).toMatchObject({ delivery: "failed" });
  });
});

describe("file store (local development backend)", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "nuzz-grooming-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("only-if-new, compare-and-swap updates, listing and binaries", async () => {
    const store = fileGroomingStore(dir);
    expect(await store.createJSON("claims/2026-11-24/1000/1", { a: 1 })).toBe(true);
    expect(await store.createJSON("claims/2026-11-24/1000/1", { a: 2 })).toBe(false);
    expect(await store.listKeys("claims/2026-11-24/")).toEqual(["claims/2026-11-24/1000/1"]);
    await Promise.all(Array.from({ length: 10 }, () => store.updateJSON<number>("config/counter", (n) => (n ?? 0) + 1)));
    expect(await store.readJSON("config/counter")).toBe(10);
    await store.writeBinary("media/x.jpg", Buffer.from([1, 2, 3]));
    expect([...(await store.readBinary("media/x.jpg"))!]).toEqual([1, 2, 3]);
    await expect(store.readJSON("../secret")).rejects.toThrow();
  });

  it("runs a whole booking end to end on disk", async () => {
    const store = fileGroomingStore(path.join(dir, "flow"));
    const res = await create(store, request());
    expect(res.ok).toBe(true);
    expect(await listBookings(store)).toHaveLength(1);
  });
});
