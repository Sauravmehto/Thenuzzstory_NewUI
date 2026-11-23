import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { availableStarts, coveredSlots, daysBetween, slotKey, storeNow } from "@/lib/grooming/availability";
import { findBreed } from "@/lib/grooming/breeds";
import { estimate, estimateChanged, sizeBandFor, slotsNeeded } from "@/lib/grooming/pricing";
import {
  HOLDS_CAPACITY,
  type AppointmentSlot,
  type AvailabilityConfig,
  type BookingStatus,
  type DayAvailability,
  type Estimate,
  type GroomingBooking,
  type PricingConfig,
} from "@/lib/grooming/types";
import { cleanBooking, validateBooking, type BookingErrors, type BookingRequest } from "@/lib/grooming/validation";
import type { GroomingStore } from "./grooming-store";

/*
 * Grooming bookings: requests from the website, then admin decisions.
 *
 * No overbooking: every calendar slot has `capacity` seats, stored as keys
 *   claims/<date>/<HHMM>/<seat>     (seat = 1..capacity)
 * A booking claims one seat in each slot it covers with an "only if new"
 * write. Exactly one request can create a given key, so two customers racing
 * for the last seat can't both get it, whatever the calendar showed them.
 * Pending and confirmed bookings keep their seats (a pending request blocks
 * the slot until the team decides); cancel / reject delete them.
 */

const ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const BOOKING_ID_RE = /^GR-\d{6}-[2-9A-HJ-NP-Z]{6}$/;
const IDEM_KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;
/** A claim younger than this may belong to a booking still being written. */
const CLAIM_GRACE_MS = 2 * 60_000;

const bookingKey = (id: string) => `bookings/${id}`;
const claimPrefix = (date: string, time?: string) => (time ? `claims/${date}/${slotKey(time)}/` : `claims/${date}/`);
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export function newBookingId(now = new Date()): string {
  const date = storeNow(now).date.slice(2).replace(/-/g, "");
  const bytes = randomBytes(6);
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += ID_ALPHABET[bytes[i]! % ID_ALPHABET.length];
  return `GR-${date}-${suffix}`;
}

export const hashToken = (token: string) => sha256(`grooming-status:${token}`);

interface ClaimRecord {
  bookingId: string;
  at: string;
}

// ---- availability ----------------------------------------------------------------

/** Seats taken per slot ("HHMM" → count) on a date. */
export async function takenOn(store: GroomingStore, date: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const key of await store.listKeys(claimPrefix(date))) {
    const hhmm = key.split("/")[2];
    if (hhmm) counts.set(hhmm, (counts.get(hhmm) ?? 0) + 1);
  }
  return counts;
}

export async function availabilityFor(
  store: GroomingStore,
  config: AvailabilityConfig,
  dates: string[],
  slots: number,
  now = new Date(),
): Promise<DayAvailability[]> {
  return Promise.all(dates.map(async (date) => availableStarts(date, slots, config, await takenOn(store, date), now)));
}

/**
 * Availability for moving an existing booking (admin): its own seats don't
 * count against it, and the customer-facing notice / window limits don't apply.
 */
export async function rescheduleAvailability(
  store: GroomingStore,
  config: AvailabilityConfig,
  booking: GroomingBooking,
  dates: string[],
  now = new Date(),
): Promise<DayAvailability[]> {
  const adminConfig = { ...config, minNoticeMinutes: 0, maxDaysAhead: 365 };
  return Promise.all(
    dates.map(async (date) => {
      const taken = await takenOn(store, date);
      for (const key of booking.claims) {
        const [, d, hhmm] = key.split("/");
        if (d === date && hhmm) taken.set(hhmm, Math.max(0, (taken.get(hhmm) ?? 0) - 1));
      }
      return availableStarts(date, booking.appointment.slots, adminConfig, taken, now);
    }),
  );
}

// ---- seats -----------------------------------------------------------------------------

/**
 * Drops claims that no live booking owns (a crash between claiming and saving,
 * or a release that didn't finish). Claims in their grace period are kept.
 */
async function repairSlot(store: GroomingStore, date: string, time: string, now: Date) {
  for (const key of await store.listKeys(claimPrefix(date, time))) {
    const claim = await store.readJSON<ClaimRecord>(key);
    if (!claim) continue;
    if (now.getTime() - Date.parse(claim.at) < CLAIM_GRACE_MS) continue;
    const owner = await store.readJSON<GroomingBooking>(bookingKey(claim.bookingId));
    const live = owner && HOLDS_CAPACITY.includes(owner.status) && owner.claims.includes(key);
    if (!live) await store.remove(key);
  }
}

async function claimOneSeat(store: GroomingStore, bookingId: string, date: string, time: string, capacity: number, now: Date) {
  for (let pass = 0; pass < 2; pass++) {
    const existing = (await store.listKeys(claimPrefix(date, time))).length;
    if (existing < capacity) {
      for (let seat = 1; seat <= capacity; seat++) {
        const key = `${claimPrefix(date, time)}${seat}`;
        if (await store.createJSON(key, { bookingId, at: now.toISOString() } satisfies ClaimRecord)) return key;
      }
    }
    if (pass === 0) await repairSlot(store, date, time, now); // a stale claim may be in the way
  }
  return null;
}

/**
 * Claims a seat in every slot. Slots in `reuse` (claims this booking already
 * holds, by "HHMM") are kept instead of claimed again. All-or-nothing.
 */
async function claimSeats(
  store: GroomingStore,
  bookingId: string,
  date: string,
  times: string[],
  capacity: number,
  now: Date,
  reuse: Map<string, string> = new Map(),
): Promise<{ keys: string[]; fresh: string[] } | null> {
  const keys: string[] = [];
  const fresh: string[] = [];
  for (const time of times) {
    const kept = reuse.get(slotKey(time));
    if (kept) {
      keys.push(kept);
      continue;
    }
    const key = await claimOneSeat(store, bookingId, date, time, capacity, now);
    if (!key) {
      await releaseClaims(store, fresh);
      return null;
    }
    keys.push(key);
    fresh.push(key);
  }
  return { keys, fresh };
}

async function releaseClaims(store: GroomingStore, keys: readonly string[]) {
  await Promise.all(keys.map((k) => store.remove(k).catch(() => undefined)));
}

// ---- create ----------------------------------------------------------------------------

export type CreateResult =
  | { ok: true; booking: GroomingBooking; token: string | null; replay: boolean }
  | { ok: false; status: 422; code: "validation"; errors: BookingErrors }
  | { ok: false; status: 409; code: "quote_changed"; estimate: Estimate | null; message: string }
  | { ok: false; status: 409; code: "slot_unavailable"; message: string }
  | { ok: false; status: 409; code: "idempotency_conflict"; message: string }
  | { ok: false; status: 400; code: "invalid_request"; message: string }
  | { ok: false; status: 503; code: "booking_closed"; message: string };

interface IdemRecord {
  /** Null while the first request with this key is still being processed. */
  bookingId: string | null;
  fingerprint: string;
  /** The status token, so a retry gets the same status link back. */
  token: string;
  at: string;
}

/** A key claimed by a request that never finished (crash) stops blocking after this. */
const IDEM_STALE_MS = 2 * 60_000;
const IDEM_WAIT_MS = 8_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type IdemClaim =
  | { kind: "claimed" }
  | { kind: "replay"; booking: GroomingBooking; token: string }
  | { kind: "conflict" }
  | { kind: "busy" };

/**
 * Claims the idempotency key BEFORE any seat, so a double click can't race
 * itself for the last seat. A second request with the same key waits for the
 * first to finish and returns the same booking.
 */
async function claimIdempotency(store: GroomingStore, key: string, fingerprint: string, token: string): Promise<IdemClaim> {
  const deadline = Date.now() + IDEM_WAIT_MS;
  while (Date.now() < deadline) {
    // Wall-clock time (not the request's "now"): this only measures how long the claim has been held.
    if (await store.createJSON(key, { bookingId: null, fingerprint, token, at: new Date().toISOString() } satisfies IdemRecord)) return { kind: "claimed" };
    const known = await store.readJSON<IdemRecord>(key);
    if (!known) continue; // released by a request that failed: try to claim it ourselves
    if (known.fingerprint !== fingerprint) return { kind: "conflict" };
    if (known.bookingId) {
      const existing = await store.readJSON<GroomingBooking>(bookingKey(known.bookingId));
      if (existing) return { kind: "replay", booking: existing, token: known.token };
      await store.remove(key); // the booking is gone: start over
      continue;
    }
    if (Date.now() - Date.parse(known.at) > IDEM_STALE_MS) {
      await store.remove(key);
      continue;
    }
    await sleep(120); // the first request is still working
  }
  return { kind: "busy" };
}

export async function createBooking(
  store: GroomingStore,
  input: { request: BookingRequest; pricing: PricingConfig; availability: AvailabilityConfig; idempotencyKey?: string | null; now?: Date },
): Promise<CreateResult> {
  const { request, pricing, availability } = input;
  const now = input.now ?? new Date();

  if (input.idempotencyKey != null && !IDEM_KEY_RE.test(input.idempotencyKey))
    return { ok: false, status: 400, code: "invalid_request", message: "Something went wrong. Please reload the page and try again." };

  const errors = validateBooking(request);
  if (Object.keys(errors).length) return { ok: false, status: 422, code: "validation", errors };

  const cleaned = cleanBooking(request);
  const species = cleaned.pet.species;
  const sizeBand =
    species === "dog"
      ? (typeof cleaned.pet.weightKg === "number" ? sizeBandFor(cleaned.pet.weightKg, pricing.sizeBands) : (request.pet.sizeBand ?? null))
      : null;
  const selection = { species, sizeBand, mainId: request.selection.mainId, extraIds: request.selection.extraIds };

  const priced = estimate(selection, pricing);
  if (priced.kind === "invalid") return { ok: false, status: 422, code: "validation", errors: { [priced.problem.field]: priced.problem.message } };
  const actual = priced.kind === "estimate" ? priced.estimate : null;
  if (estimateChanged(request.seen.estimate, actual))
    return {
      ok: false,
      status: 409,
      code: "quote_changed",
      estimate: actual,
      message: "The estimated price changed while you were booking. Please check the new estimate.",
    };

  const slots = slotsNeeded(selection, pricing);
  if (!availability.bookingEnabled || slots === null)
    return { ok: false, status: 503, code: "booking_closed", message: "Online booking isn't open for this service yet. Please call or WhatsApp us to book." };

  const { date, start } = request.slot;
  const fingerprint = sha256(JSON.stringify([cleaned.customer.phone, cleaned.pet.name, selection, date, start]));
  const idemKey = input.idempotencyKey ? `idempotency/${sha256(input.idempotencyKey)}` : null;

  // Open at that time (hours, holidays, notice, booking window)? Capacity is
  // enforced by the seat claims below, not by this check.
  const openAtThatTime = availableStarts(date, slots, availability, new Map(), now).starts.includes(start);
  const times = coveredSlots(date, start, slots, availability);
  if (!times || !openAtThatTime)
    return { ok: false, status: 409, code: "slot_unavailable", message: "That time isn't available. Please choose another." };

  const token = randomBytes(24).toString("base64url");

  // A retry or double click with the same key: return the booking the first request saved.
  if (idemKey) {
    const claim = await claimIdempotency(store, idemKey, fingerprint, token);
    if (claim.kind === "replay") return { ok: true, booking: claim.booking, token: claim.token, replay: true };
    if (claim.kind === "conflict")
      return { ok: false, status: 409, code: "idempotency_conflict", message: "This request changed after it was sent. Please reload and try again." };
    if (claim.kind === "busy") throw new Error("An earlier request with the same key is still running.");
  }
  const releaseKey = () => (idemKey ? store.remove(idemKey).catch(() => undefined) : Promise.resolve());

  const bookingId = newBookingId(now);
  const capacity = availability.capacityOverrides.find((o) => o.date === date)?.capacity ?? availability.capacityPerSlot;
  let seats: Awaited<ReturnType<typeof claimSeats>>;
  try {
    seats = await claimSeats(store, bookingId, date, times, capacity, now);
  } catch (err) {
    await releaseKey();
    throw err;
  }
  if (!seats) {
    await releaseKey();
    return { ok: false, status: 409, code: "slot_unavailable", message: "That time was just taken. Please pick another." };
  }

  const breed = findBreed(species, cleaned.pet.breedId)!;
  const slot: AppointmentSlot = { date, start, slots };
  const at = now.toISOString();
  const booking: GroomingBooking = {
    bookingId,
    statusTokenHash: hashToken(token),
    status: "pending_confirmation",
    rescheduled: false,
    createdAt: at,
    updatedAt: at,
    customer: cleaned.customer,
    pet: { ...cleaned.pet, breedName: breed.name, ...(sizeBand ? { sizeBand } : {}) },
    services: { mainId: selection.mainId, extraIds: selection.extraIds },
    estimate: actual,
    pricingVersion: pricing.version,
    requested: slot,
    appointment: slot,
    claims: seats.keys,
    ...(cleaned.notes ? { notes: cleaned.notes } : {}),
    adminNotes: [],
    history: [{ at, action: "created", to: "pending_confirmation", slot, by: "customer" }],
    whatsappLog: [],
  };

  try {
    if (!(await store.createJSON(bookingKey(bookingId), booking))) throw new Error("Booking id collision.");
  } catch (err) {
    await releaseClaims(store, seats.keys);
    await releaseKey();
    throw err;
  }

  // Point the key at the saved booking, so retries get it back.
  if (idemKey) await store.writeJSON(idemKey, { bookingId, fingerprint, token, at: new Date().toISOString() } satisfies IdemRecord);

  return { ok: true, booking, token, replay: false };
}

// ---- read ----------------------------------------------------------------------------------

export async function getBooking(store: GroomingStore, id: string): Promise<GroomingBooking | null> {
  return BOOKING_ID_RE.test(id) ? store.readJSON<GroomingBooking>(bookingKey(id)) : null;
}

/** Every booking, newest first (admin). */
export async function listBookings(store: GroomingStore): Promise<GroomingBooking[]> {
  const keys = (await store.listKeys("bookings/")).filter((k) => BOOKING_ID_RE.test(k.slice("bookings/".length)));
  const all = await Promise.all(keys.map((k) => store.readJSON<GroomingBooking>(k)));
  return all.filter((b): b is GroomingBooking => !!b).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The booking for a customer's status link, or null (wrong id or token). */
export async function bookingForToken(store: GroomingStore, id: string, token: string | null): Promise<GroomingBooking | null> {
  if (!token || token.length > 100) return null;
  const booking = await getBooking(store, id);
  if (!booking) return null;
  const a = Buffer.from(booking.statusTokenHash);
  const b = Buffer.from(hashToken(token));
  return a.length === b.length && timingSafeEqual(a, b) ? booking : null;
}

// ---- admin actions --------------------------------------------------------------------------

export type AdminAction =
  | { action: "confirm"; note?: string }
  | { action: "complete"; note?: string }
  | { action: "cancel"; reason: string }
  | { action: "reject"; reason: string }
  | { action: "reschedule"; date: string; start: string; note?: string }
  | { action: "note"; note: string }
  | { action: "whatsapp_opened"; template: string };

const ALLOWED: Record<string, BookingStatus[]> = {
  confirm: ["pending_confirmation"],
  complete: ["confirmed"],
  cancel: ["pending_confirmation", "confirmed"],
  reject: ["pending_confirmation"],
  reschedule: ["pending_confirmation", "confirmed"],
};

export type ActionResult =
  | { ok: true; booking: GroomingBooking }
  | { ok: false; status: 400 | 404 | 409; code: string; message: string };

export async function applyAdminAction(
  store: GroomingStore,
  id: string,
  act: AdminAction,
  availability: AvailabilityConfig,
  now = new Date(),
): Promise<ActionResult> {
  const booking = await getBooking(store, id);
  if (!booking) return { ok: false, status: 404, code: "not_found", message: "Booking not found." };
  const allowed = ALLOWED[act.action];
  if (allowed && !allowed.includes(booking.status))
    return { ok: false, status: 409, code: "invalid_transition", message: `A ${booking.status.replace("_", " ")} booking can't be changed that way.` };

  const at = now.toISOString();
  const note = "note" in act && act.note?.trim() ? act.note.trim().slice(0, 500) : undefined;

  if (act.action === "reschedule") {
    const slots = booking.appointment.slots;
    if (daysBetween(storeNow(now).date, act.date) < 0)
      return { ok: false, status: 409, code: "slot_unavailable", message: "That date is in the past. Choose another." };
    const times = coveredSlots(act.date, act.start, slots, availability);
    if (!times) return { ok: false, status: 409, code: "slot_unavailable", message: "The store isn't open for that whole time. Choose another." };
    // Our own seats don't count against us when the new time overlaps the old one.
    const own = new Map<string, string>();
    for (const key of booking.claims) {
      const [, date, hhmm] = key.split("/");
      if (date === act.date && hhmm) own.set(hhmm, key);
    }
    const capacity = availability.capacityOverrides.find((o) => o.date === act.date)?.capacity ?? availability.capacityPerSlot;
    const seats = await claimSeats(store, booking.bookingId, act.date, times, capacity, now, own);
    if (!seats) return { ok: false, status: 409, code: "slot_unavailable", message: "That time is fully booked. Choose another." };
    const slot: AppointmentSlot = { date: act.date, start: act.start, slots };
    const next = await store.updateJSON<GroomingBooking>(bookingKey(id), (cur) => {
      const b = cur ?? booking;
      return {
        ...b,
        appointment: slot,
        claims: seats.keys,
        rescheduled: true,
        updatedAt: at,
        history: [...b.history, { at, action: "reschedule", slot, previousSlot: b.appointment, ...(note ? { note } : {}), by: "admin" }],
        adminNotes: note ? [...b.adminNotes, { at, text: note }] : b.adminNotes,
      };
    });
    await releaseClaims(store, booking.claims.filter((k) => !seats.keys.includes(k)));
    return { ok: true, booking: next };
  }

  if (act.action === "cancel" || act.action === "reject") {
    const reason = act.reason?.trim();
    if (!reason) return { ok: false, status: 400, code: "reason_required", message: "Add a reason (it's kept in the booking history)." };
    const to: BookingStatus = act.action === "cancel" ? "cancelled" : "rejected";
    const next = await store.updateJSON<GroomingBooking>(bookingKey(id), (cur) => {
      const b = cur ?? booking;
      return { ...b, status: to, updatedAt: at, history: [...b.history, { at, action: act.action, from: b.status, to, reason: reason.slice(0, 500), by: "admin" }] };
    });
    await releaseClaims(store, booking.claims); // the slot opens up again
    return { ok: true, booking: next };
  }

  if (act.action === "confirm" || act.action === "complete") {
    const to: BookingStatus = act.action === "confirm" ? "confirmed" : "completed";
    const next = await store.updateJSON<GroomingBooking>(bookingKey(id), (cur) => {
      const b = cur ?? booking;
      return {
        ...b,
        status: to,
        updatedAt: at,
        history: [...b.history, { at, action: act.action, from: b.status, to, ...(note ? { note } : {}), by: "admin" }],
        adminNotes: note ? [...b.adminNotes, { at, text: note }] : b.adminNotes,
      };
    });
    return { ok: true, booking: next };
  }

  if (act.action === "note") {
    if (!note) return { ok: false, status: 400, code: "note_required", message: "Write a note first." };
    const next = await store.updateJSON<GroomingBooking>(bookingKey(id), (cur) => {
      const b = cur ?? booking;
      return { ...b, updatedAt: at, adminNotes: [...b.adminNotes, { at, text: note }], history: [...b.history, { at, action: "note", note, by: "admin" }] };
    });
    return { ok: true, booking: next };
  }

  if (act.action === "whatsapp_opened") {
    const template = String(act.template ?? "").slice(0, 40);
    const next = await store.updateJSON<GroomingBooking>(bookingKey(id), (cur) => {
      const b = cur ?? booking;
      return { ...b, whatsappLog: [...b.whatsappLog, { at, template }] };
    });
    return { ok: true, booking: next };
  }

  return { ok: false, status: 400, code: "invalid_request", message: "Unknown action." };
}

// ---- public view ------------------------------------------------------------------------------

/** What the customer's status page may show: no phone numbers, no admin notes. */
export function publicBooking(b: GroomingBooking) {
  return {
    bookingId: b.bookingId,
    status: b.status,
    rescheduled: b.rescheduled,
    firstName: b.customer.name.split(" ")[0] ?? "",
    pet: { name: b.pet.name, species: b.pet.species, breedName: b.pet.breedOther ?? b.pet.breedName },
    services: b.services,
    estimate: b.estimate,
    appointment: b.appointment,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}
export type PublicBooking = ReturnType<typeof publicBooking>;
