import { normalizePhone } from "@/lib/validation";
import { isDate, isTime } from "./availability";
import { findBreed, OTHER_BREED_ID } from "./breeds";
import { SIZE_BANDS, type Estimate, type SizeBand, type Species } from "./types";

/*
 * One set of rules for the booking form, run in the browser (instant feedback)
 * and again on the server (the browser can't be trusted).
 */

export interface BookingRequest {
  pet: {
    species: Species;
    name: string;
    breedId: string;
    breedOther?: string;
    ageText?: string;
    /** Optional: when given it decides the size band. */
    weightKg?: number | null;
    /** Chosen by the customer when they don't know the weight. */
    sizeBand?: SizeBand | null;
    coat?: string;
  };
  selection: { mainId: string; extraIds: string[] };
  slot: { date: string; start: string };
  customer: { name: string; phone: string; whatsapp?: string; email?: string };
  notes?: string;
  /** The estimate the customer was shown, only used to detect a price change. */
  seen: { estimate: Estimate | null };
  /** Honeypot: real people never fill this hidden field. */
  website?: string;
}

export type BookingField =
  | "species"
  | "petName"
  | "breed"
  | "breedOther"
  | "ageText"
  | "weightKg"
  | "sizeBand"
  | "coat"
  | "mainId"
  | "extraIds"
  | "slot"
  | "name"
  | "phone"
  | "whatsapp"
  | "email"
  | "notes";

export type BookingErrors = Partial<Record<BookingField, string>>;

export const COATS = ["short", "medium", "long", "double", "other"] as const;
export const COAT_LABEL: Record<(typeof COATS)[number], string> = {
  short: "Short",
  medium: "Medium",
  long: "Long",
  double: "Double coat",
  other: "Other / not sure",
};

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254;
const clean = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

export const LIMITS = { petName: 40, breedOther: 60, ageText: 30, name: 80, notes: 500 } as const;

export function validatePet(pet: Partial<BookingRequest["pet"]>): BookingErrors {
  const e: BookingErrors = {};
  if (pet.species !== "dog" && pet.species !== "cat") e.species = "Choose dog or cat.";
  const name = clean(pet.name);
  if (!name) e.petName = "What's your pet's name?";
  else if (name.length > LIMITS.petName) e.petName = `Keep the name under ${LIMITS.petName} characters.`;
  if (!pet.breedId) e.breed = "Choose a breed, or “Other / Not listed”.";
  else if (pet.species && !findBreed(pet.species, pet.breedId)) e.breed = "Choose a breed from the list.";
  else if (pet.breedId === OTHER_BREED_ID) {
    const other = clean(pet.breedOther);
    if (!other) e.breedOther = "Tell us the breed (or “not sure”).";
    else if (other.length > LIMITS.breedOther) e.breedOther = `Keep it under ${LIMITS.breedOther} characters.`;
  }
  if (clean(pet.ageText).length > LIMITS.ageText) e.ageText = `Keep it under ${LIMITS.ageText} characters.`;
  if (pet.weightKg !== undefined && pet.weightKg !== null) {
    if (typeof pet.weightKg !== "number" || !Number.isFinite(pet.weightKg) || pet.weightKg <= 0 || pet.weightKg > 120)
      e.weightKg = "Enter a weight between 0.1 and 120 kg.";
  }
  if (pet.sizeBand !== undefined && pet.sizeBand !== null && !SIZE_BANDS.includes(pet.sizeBand)) e.sizeBand = "Choose a size.";
  if (pet.coat !== undefined && pet.coat !== "" && !(COATS as readonly string[]).includes(pet.coat)) e.coat = "Choose a coat type.";
  return e;
}

export function validateContact(customer: Partial<BookingRequest["customer"]>, notes?: string): BookingErrors {
  const e: BookingErrors = {};
  const name = clean(customer.name);
  if (name.length < 2) e.name = "Enter your full name.";
  else if (name.length > LIMITS.name) e.name = `Keep your name under ${LIMITS.name} characters.`;
  const phone = clean(customer.phone);
  if (!phone) e.phone = "Enter your mobile number.";
  else if (!normalizePhone(phone)) e.phone = "Enter a valid 10-digit Indian mobile number, like 98765 43210.";
  const wa = clean(customer.whatsapp);
  if (wa && !normalizePhone(wa)) e.whatsapp = "Enter a valid 10-digit WhatsApp number, or tick “same as mobile”.";
  const email = clean(customer.email);
  if (email && !isEmail(email)) e.email = "Enter a valid email, like name@example.com (or leave it empty).";
  if ((notes ?? "").trim().length > LIMITS.notes) e.notes = `Keep notes under ${LIMITS.notes} characters.`;
  return e;
}

export function validateSlot(slot: Partial<BookingRequest["slot"]> | undefined): BookingErrors {
  return slot && isDate(slot.date) && isTime(slot.start) ? {} : { slot: "Choose a date and time." };
}

/** Every rule at once (server side, and before the final submit). */
export function validateBooking(req: BookingRequest): BookingErrors {
  return { ...validatePet(req.pet ?? {}), ...validateContact(req.customer ?? {}, req.notes), ...validateSlot(req.slot) };
}

/** The request as it's saved: trimmed text, phones as 10 digits, email lower-cased. */
export function cleanBooking(req: BookingRequest) {
  const phone = normalizePhone(req.customer.phone)!;
  const whatsapp = req.customer.whatsapp?.trim() ? normalizePhone(req.customer.whatsapp)! : phone;
  const email = clean(req.customer.email).toLowerCase();
  const breedOther = clean(req.pet.breedOther);
  const ageText = clean(req.pet.ageText);
  const notes = (req.notes ?? "").trim().replace(/[ \t]+/g, " ");
  return {
    customer: { name: clean(req.customer.name), phone, whatsapp, ...(email ? { email } : {}) },
    pet: {
      species: req.pet.species,
      name: clean(req.pet.name),
      breedId: req.pet.breedId,
      ...(req.pet.breedId === OTHER_BREED_ID && breedOther ? { breedOther } : {}),
      ...(ageText ? { ageText } : {}),
      ...(typeof req.pet.weightKg === "number" ? { weightKg: Math.round(req.pet.weightKg * 10) / 10 } : {}),
      ...(req.pet.coat ? { coat: req.pet.coat } : {}),
    },
    notes: notes || undefined,
  };
}

/** Structural check of an untrusted request body, before the field rules. */
export function isBookingRequestShape(v: unknown): v is BookingRequest {
  const r = v as BookingRequest;
  const str = (x: unknown) => typeof x === "string" && x.length <= 600;
  const optStr = (x: unknown) => x === undefined || str(x);
  return (
    typeof v === "object" &&
    v !== null &&
    typeof r.pet === "object" &&
    r.pet !== null &&
    str(r.pet.species) &&
    str(r.pet.name) &&
    str(r.pet.breedId) &&
    optStr(r.pet.breedOther) &&
    optStr(r.pet.ageText) &&
    optStr(r.pet.coat) &&
    (r.pet.weightKg === undefined || r.pet.weightKg === null || typeof r.pet.weightKg === "number") &&
    (r.pet.sizeBand === undefined || r.pet.sizeBand === null || str(r.pet.sizeBand)) &&
    typeof r.selection === "object" &&
    r.selection !== null &&
    str(r.selection.mainId) &&
    Array.isArray(r.selection.extraIds) &&
    r.selection.extraIds.length <= 12 &&
    r.selection.extraIds.every(str) &&
    typeof r.slot === "object" &&
    r.slot !== null &&
    str(r.slot.date) &&
    str(r.slot.start) &&
    typeof r.customer === "object" &&
    r.customer !== null &&
    str(r.customer.name) &&
    str(r.customer.phone) &&
    optStr(r.customer.whatsapp) &&
    optStr(r.customer.email) &&
    optStr(r.notes) &&
    typeof r.seen === "object" &&
    r.seen !== null &&
    (r.seen.estimate === null || (typeof r.seen.estimate === "object" && Array.isArray(r.seen.estimate.lines))) &&
    optStr(r.website)
  );
}
