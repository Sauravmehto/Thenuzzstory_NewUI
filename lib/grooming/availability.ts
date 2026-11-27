import { WEEKDAYS, type AvailabilityConfig, type DayAvailability, type OpenRange, type Weekday } from "./types";

/*
 * Appointment availability, as pure functions over store-local wall-clock
 * strings ("2026-11-24", "11:30"). No Date maths in local time zones: the
 * store is in India (UTC+5:30, no daylight saving), so "now" is converted once.
 *
 * Slot keys are "HHMM" (e.g. "1130"): used in claim keys on the server.
 */

export const STORE_UTC_OFFSET_MINUTES = 330; // Asia/Kolkata
export const BUSINESS_OPEN_TIME = "10:00";
export const BUSINESS_CLOSE_TIME = "19:00";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isDate = (v: unknown): v is string => {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
export const isTime = (v: unknown): v is string => typeof v === "string" && TIME_RE.test(v);

export const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const fromMinutes = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const slotKey = (time: string) => time.replace(":", "");

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export const weekdayOf = (date: string): Weekday => {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  // getUTCDay: 0 = Sunday
  return WEEKDAYS[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7]!;
};

/** The store's current date and minute of the day. */
export function storeNow(now: Date = new Date()): { date: string; minutes: number } {
  const shifted = new Date(now.getTime() + STORE_UTC_OFFSET_MINUTES * 60_000);
  return { date: shifted.toISOString().slice(0, 10), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function capacityOn(date: string, config: AvailabilityConfig): number {
  return config.capacityOverrides.find((o) => o.date === date)?.capacity ?? config.capacityPerSlot;
}

/** Every slot start the store is open for that day (before bookings), or a reason it's closed. */
export function openSlots(date: string, config: AvailabilityConfig): { starts: string[]; closedReason?: string } {
  const closed = config.closedDates.find((c) => c.date === date);
  if (closed) return { starts: [], closedReason: closed.reason || "Closed" };
  const ranges = config.weekly[weekdayOf(date)];
  if (!ranges || ranges.length === 0) return { starts: [], closedReason: "Closed" };
  if (capacityOn(date, config) < 1) return { starts: [], closedReason: "Fully booked" };

  const blocked = config.blockedSlots.filter((b) => b.date === date).map((b) => [toMinutes(b.start), toMinutes(b.end)] as const);
  const starts: string[] = [];
  const step = config.slotMinutes;
  const dayOpen = toMinutes(BUSINESS_OPEN_TIME);
  const dayClose = toMinutes(BUSINESS_CLOSE_TIME);
  for (const range of ranges) {
    // Business policy: customer bookings are only between 10:00 and 19:00.
    const from = Math.max(toMinutes(range.open), dayOpen);
    const to = Math.min(toMinutes(range.close), dayClose);
    if (to <= from) continue;
    for (let t = from; t + step <= to; t += step) {
      if (blocked.some(([from, to]) => t < to && t + step > from)) continue;
      starts.push(fromMinutes(t));
    }
  }
  return { starts };
}

/** The consecutive slots an appointment starting at `start` covers, or null if they don't all exist. */
export function coveredSlots(date: string, start: string, slots: number, config: AvailabilityConfig): string[] | null {
  const open = new Set(openSlots(date, config).starts);
  const covered: string[] = [];
  for (let i = 0; i < slots; i++) {
    const t = fromMinutes(toMinutes(start) + i * config.slotMinutes);
    if (!open.has(t)) return null;
    covered.push(t);
  }
  return covered;
}

/** Whether a date can be booked at all (not past, not too far ahead). */
export function inBookingWindow(date: string, config: AvailabilityConfig, now: Date = new Date()): boolean {
  const today = storeNow(now).date;
  const ahead = daysBetween(today, date);
  return ahead >= 0 && ahead <= config.maxDaysAhead;
}

/**
 * Start times for one day that can take `slots` consecutive slots, given how
 * many seats are already taken per slot ("HHMM" → count).
 */
export function availableStarts(
  date: string,
  slots: number,
  config: AvailabilityConfig,
  taken: ReadonlyMap<string, number>,
  now: Date = new Date(),
): DayAvailability {
  if (!inBookingWindow(date, config, now)) return { date, starts: [], closedReason: "Not bookable" };
  const { starts: open, closedReason } = openSlots(date, config);
  if (open.length === 0) return { date, starts: [], closedReason };

  const capacity = capacityOn(date, config);
  const openSet = new Set(open);
  const current = storeNow(now);
  // Minutes from the start of today, so a notice period can run past midnight (or several days).
  const dayOffset = daysBetween(current.date, date) * 1440;
  const earliest = current.minutes + config.minNoticeMinutes;

  const starts = open.filter((start) => {
    const begin = toMinutes(start);
    if (dayOffset + begin < earliest) return false;
    for (let i = 0; i < slots; i++) {
      const t = fromMinutes(begin + i * config.slotMinutes);
      if (!openSet.has(t)) return false;
      if ((taken.get(slotKey(t)) ?? 0) >= capacity) return false;
    }
    return true;
  });
  return starts.length ? { date, starts } : { date, starts: [], closedReason: "Fully booked" };
}

export const DEFAULT_AVAILABILITY: AvailabilityConfig = {
  bookingEnabled: false,
  slotMinutes: 30,
  weekly: { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null },
  capacityPerSlot: 1,
  capacityOverrides: [],
  closedDates: [],
  blockedSlots: [],
  minNoticeMinutes: 120,
  maxDaysAhead: 30,
  updatedAt: "1970-01-01T00:00:00.000Z",
};

/** Problems with an edited availability config (empty = valid). */
export function availabilityProblems(config: AvailabilityConfig): string[] {
  const p: string[] = [];
  if (typeof config.bookingEnabled !== "boolean") p.push("Choose whether online booking is on.");
  if (![15, 20, 30, 45, 60, 90, 120].includes(config.slotMinutes)) p.push("Slot length must be 15, 20, 30, 45, 60, 90 or 120 minutes.");
  if (!Number.isInteger(config.capacityPerSlot) || config.capacityPerSlot < 1 || config.capacityPerSlot > 20)
    p.push("Pets at the same time must be between 1 and 20.");
  if (!Number.isInteger(config.minNoticeMinutes) || config.minNoticeMinutes < 0 || config.minNoticeMinutes > 7 * 1440)
    p.push("Minimum notice must be between 0 minutes and 7 days.");
  if (!Number.isInteger(config.maxDaysAhead) || config.maxDaysAhead < 1 || config.maxDaysAhead > 180)
    p.push("Customers can book between 1 and 180 days ahead.");
  for (const day of WEEKDAYS) {
    const ranges = config.weekly?.[day];
    if (ranges === null) continue;
    if (!Array.isArray(ranges) || ranges.length > 4) {
      p.push(`${day}: up to 4 opening ranges.`);
      continue;
    }
    const sorted = [...ranges].sort((a, b) => a.open.localeCompare(b.open));
    sorted.forEach((r: OpenRange, i) => {
      if (!isTime(r.open) || !isTime(r.close) || toMinutes(r.close) <= toMinutes(r.open))
        p.push(`${day}: each range needs an opening time before its closing time.`);
      else if (i > 0 && toMinutes(r.open) < toMinutes(sorted[i - 1]!.close)) p.push(`${day}: opening ranges overlap.`);
      if (isTime(r.open) && isTime(r.close)) {
        if (toMinutes(r.open) < toMinutes(BUSINESS_OPEN_TIME) || toMinutes(r.close) > toMinutes(BUSINESS_CLOSE_TIME))
          p.push(`${day}: opening ranges must stay within ${BUSINESS_OPEN_TIME}–${BUSINESS_CLOSE_TIME}.`);
      }
    });
  }
  for (const c of config.closedDates ?? []) if (!isDate(c.date)) p.push(`Closed date "${c.date}" isn't a valid date.`);
  for (const o of config.capacityOverrides ?? [])
    if (!isDate(o.date) || !Number.isInteger(o.capacity) || o.capacity < 0 || o.capacity > 20) p.push(`Capacity for ${o.date} must be 0–20.`);
  for (const b of config.blockedSlots ?? [])
    if (!isDate(b.date) || !isTime(b.start) || !isTime(b.end) || toMinutes(b.end) <= toMinutes(b.start))
      p.push(`Blocked time on ${b.date} needs a start before its end.`);
  return p;
}
