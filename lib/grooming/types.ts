import type { Cents } from "@/lib/types";

/*
 * Grooming domain types. Grooming is a service booked at the store, not a
 * product: it has its own pricing config, availability and bookings, kept
 * apart from the product catalog, cart and orders.
 *
 * Money is integer paise (`Cents`), like the rest of the site.
 * Dates are "YYYY-MM-DD" and times "HH:MM", always store-local (Asia/Kolkata).
 */

export type Species = "dog" | "cat";
export type SizeBand = "small" | "medium" | "large" | "giant";
export const SIZE_BANDS: readonly SizeBand[] = ["small", "medium", "large", "giant"];

// ---- pricing ------------------------------------------------------------------

export interface SizeBandDef {
  id: SizeBand;
  label: string;
  /** Upper bound in kg, inclusive (10 kg is Small). Null = no upper bound. */
  maxKg: number | null;
}

export interface GroomingSection {
  id: string;
  title: string;
  order: number;
  /** "Included in every …" list printed under the section heading. */
  inclusions: string[];
}

export type ServicePrice =
  | { type: "flat"; cents: Cents }
  | { type: "by_size"; bands: Partial<Record<SizeBand, Cents>> };

export interface GroomingService {
  id: string;
  sectionId: string;
  name: string;
  /** Short line under the name, e.g. "All coat". */
  subtitle?: string;
  description: string;
  /** Eligibility text, kept verbatim from the printed menu. */
  condition?: string;
  species: Species[];
  /** Packages are main_only; quick services and massages can also be added as extras. */
  role: "main_only" | "main_or_extra";
  price: ServicePrice;
  /** The price printed on the menu, so admin can see when a live price differs from it. */
  menuPrice: ServicePrice;
  /** How many consecutive calendar slots it takes. Null = not set yet → can't be booked online. */
  slotsNeeded: number | null;
  active: boolean;
  order: number;
}

export interface PricingConfig {
  version: number;
  updatedAt: string;
  sizeBands: SizeBandDef[];
  sections: GroomingSection[];
  services: GroomingService[];
}

export interface ServiceSelection {
  species: Species;
  /** Required when the main service or an extra is priced by size. */
  sizeBand?: SizeBand | null;
  mainId: string;
  extraIds: string[];
}

export interface EstimateLine {
  serviceId: string;
  name: string;
  cents: Cents;
  role: "main" | "extra";
}

export interface Estimate {
  lines: EstimateLine[];
  totalCents: Cents;
}

// ---- availability ----------------------------------------------------------------

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const WEEKDAYS: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export interface OpenRange {
  open: string;
  close: string;
}

export interface AvailabilityConfig {
  /** Older saved availability includes this. It no longer hides the calendar. */
  bookingEnabled: boolean;
  slotMinutes: number;
  /** Null = closed that day. Several ranges = a break in between. */
  weekly: Record<Weekday, OpenRange[] | null>;
  /** Pets that can be groomed at the same time (e.g. number of groomers). */
  capacityPerSlot: number;
  capacityOverrides: { date: string; capacity: number }[];
  closedDates: { date: string; reason: string }[];
  blockedSlots: { date: string; start: string; end: string; reason: string }[];
  minNoticeMinutes: number;
  maxDaysAhead: number;
  updatedAt: string;
}

export interface DayAvailability {
  date: string;
  /** Start times that can take the requested duration right now. */
  starts: string[];
  /** Why there are no starts (for a helpful message). */
  closedReason?: string;
}

// ---- bookings ------------------------------------------------------------------

export type BookingStatus = "pending_confirmation" | "confirmed" | "completed" | "cancelled" | "rejected";

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  pending_confirmation: "Pending confirmation",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

/** Statuses that keep their calendar slot(s) taken. */
export const HOLDS_CAPACITY: readonly BookingStatus[] = ["pending_confirmation", "confirmed", "completed"];

export interface AppointmentSlot {
  date: string;
  start: string;
  slots: number;
}

export type BookingAction = "created" | "confirm" | "reschedule" | "cancel" | "reject" | "complete" | "note" | "whatsapp_opened";

export interface BookingHistoryEntry {
  at: string;
  action: BookingAction;
  from?: BookingStatus;
  to?: BookingStatus;
  slot?: AppointmentSlot;
  previousSlot?: AppointmentSlot;
  reason?: string;
  note?: string;
  by: "customer" | "admin";
}

export interface GroomingBooking {
  bookingId: string;
  /** sha256 of the random token in the customer's status link. */
  statusTokenHash: string;
  status: BookingStatus;
  rescheduled: boolean;
  createdAt: string;
  updatedAt: string;
  customer: { name: string; phone: string; whatsapp: string; email?: string };
  pet: {
    species: Species;
    name: string;
    breedId: string;
    breedName: string;
    breedOther?: string;
    ageText?: string;
    weightKg?: number;
    coat?: string;
    sizeBand?: SizeBand;
  };
  services: { mainId: string; extraIds: string[] };
  /** Price snapshot at request time. Null = custom quote (no reliable price). */
  estimate: Estimate | null;
  pricingVersion: number;
  /** What the customer first asked for. Never changes. */
  requested: AppointmentSlot;
  /** The current appointment (moves on reschedule). */
  appointment: AppointmentSlot;
  /** Calendar claim keys this booking holds (see lib/server/grooming-bookings.ts). */
  claims: string[];
  notes?: string;
  adminNotes: { at: string; text: string }[];
  history: BookingHistoryEntry[];
  /** When admin opened a pre-filled WhatsApp link. Opening a link is not proof it was sent. */
  whatsappLog: { at: string; template: string; delivery?: "opened" | "sent" | "failed"; error?: string }[];
}

// ---- content (admin-managed) ------------------------------------------------------

export interface GroomingVideo {
  id: string;
  /** Instagram shortcode only; the URL is rebuilt by us. */
  shortcode: string;
  kind: "reel" | "p";
  title: string;
  petName?: string;
  breed?: string;
  description?: string;
  testimonial?: string;
  coverSrc?: string;
  active: boolean;
  order: number;
}

export interface GalleryItem {
  id: string;
  src: string;
  alt: string;
  petName?: string;
  breed?: string;
  service?: string;
  caption?: string;
  /** Placeholder / stock photo: labelled "Sample photo", never presented as a real customer. */
  isSample: boolean;
  credit?: string;
  active: boolean;
  order: number;
}

export interface Testimonial {
  id: string;
  customerName: string;
  petName?: string;
  rating: number;
  text: string;
  instagramUrl?: string;
  date?: string;
  active: boolean;
  order: number;
}

export type ContentKind = "videos" | "gallery" | "testimonials";

export interface ContentMap {
  videos: GroomingVideo;
  gallery: GalleryItem;
  testimonials: Testimonial;
}
