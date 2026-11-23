import { parseInstagramUrl } from "./instagram";
import type { ContentKind, ContentMap, GalleryItem, GroomingVideo, Testimonial } from "./types";

/*
 * Turns untrusted admin input into a content item, or explains what's wrong.
 * Shared by the admin forms (instant feedback) and the admin API (enforced).
 */

/** Images we serve: uploaded grooming media or files shipped in public/assets. */
export const MEDIA_SRC_RE = /^\/api\/grooming\/media\/[a-f0-9]{64}\.jpg$/;
const ASSET_SRC_RE = /^\/assets\/[A-Za-z0-9/_.-]+\.(?:jpe?g|png|webp|avif)$/;
export const isServableImage = (src: unknown): src is string => typeof src === "string" && (MEDIA_SRC_RE.test(src) || (ASSET_SRC_RE.test(src) && !src.includes("..")));

type Result<T> = { ok: true; item: T } | { ok: false; errors: Record<string, string> };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max + 1) : "");
const optional = (errors: Record<string, string>, field: string, v: unknown, max: number) => {
  const t = text(v, max);
  if (t.length > max) errors[field] = `Keep it under ${max} characters.`;
  return t || undefined;
};

export function parseVideo(input: Record<string, unknown>, base: Pick<GroomingVideo, "id" | "order">): Result<GroomingVideo> {
  const errors: Record<string, string> = {};
  const link = parseInstagramUrl(String(input.url ?? ""));
  if (!link) errors.url = "Paste an Instagram Reel or post link, like https://www.instagram.com/reel/…";
  const title = text(input.title, 80);
  if (!title) errors.title = "Give the video a title.";
  else if (title.length > 80) errors.title = "Keep the title under 80 characters.";
  const coverSrc = input.coverSrc ? String(input.coverSrc) : undefined;
  if (coverSrc && !isServableImage(coverSrc)) errors.coverSrc = "Upload the cover image again.";
  const item: GroomingVideo = {
    ...base,
    shortcode: link?.shortcode ?? "",
    kind: link?.kind ?? "reel",
    title,
    petName: optional(errors, "petName", input.petName, 40),
    breed: optional(errors, "breed", input.breed, 60),
    description: optional(errors, "description", input.description, 280),
    testimonial: optional(errors, "testimonial", input.testimonial, 280),
    coverSrc,
    active: input.active !== false,
  };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, item };
}

export function parseGalleryItem(input: Record<string, unknown>, base: Pick<GalleryItem, "id" | "order">): Result<GalleryItem> {
  const errors: Record<string, string> = {};
  const src = String(input.src ?? "");
  if (!isServableImage(src)) errors.src = "Upload a photo.";
  const alt = text(input.alt, 160);
  if (!alt) errors.alt = "Describe the photo for people using screen readers (e.g. “Bruno the beagle after his spa bath”).";
  else if (alt.length > 160) errors.alt = "Keep it under 160 characters.";
  const item: GalleryItem = {
    ...base,
    src,
    alt,
    petName: optional(errors, "petName", input.petName, 40),
    breed: optional(errors, "breed", input.breed, 60),
    service: optional(errors, "service", input.service, 80),
    caption: optional(errors, "caption", input.caption, 200),
    credit: optional(errors, "credit", input.credit, 120),
    isSample: input.isSample === true,
    active: input.active !== false,
  };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, item };
}

export function parseTestimonial(input: Record<string, unknown>, base: Pick<Testimonial, "id" | "order">): Result<Testimonial> {
  const errors: Record<string, string> = {};
  const customerName = text(input.customerName, 60);
  if (!customerName) errors.customerName = "Add the customer's name (first name is fine).";
  else if (customerName.length > 60) errors.customerName = "Keep it under 60 characters.";
  const reviewText = text(input.text, 600);
  if (reviewText.length < 5) errors.text = "Paste the review text.";
  else if (reviewText.length > 600) errors.text = "Keep it under 600 characters.";
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.rating = "Choose 1 to 5 stars.";
  const instagramUrl = input.instagramUrl ? String(input.instagramUrl).trim() : undefined;
  if (instagramUrl && !parseInstagramUrl(instagramUrl)) errors.instagramUrl = "Use an Instagram Reel or post link, or leave it empty.";
  const date = input.date ? String(input.date) : undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = "Use a valid date.";
  const item: Testimonial = {
    ...base,
    customerName,
    petName: optional(errors, "petName", input.petName, 40),
    rating,
    text: reviewText,
    instagramUrl,
    date,
    active: input.active !== false,
  };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, item };
}

export const CONTENT_LIMIT: Record<ContentKind, number> = { videos: 12, gallery: 60, testimonials: 40 };

export const parseContent: { [K in ContentKind]: (input: Record<string, unknown>, base: { id: string; order: number }) => Result<ContentMap[K]> } = {
  videos: parseVideo,
  gallery: parseGalleryItem,
  testimonials: parseTestimonial,
};

export const isContentKind = (v: string): v is ContentKind => v === "videos" || v === "gallery" || v === "testimonials";
