import "server-only";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import type { GroomingStore } from "./grooming-store";

/* Small helpers shared by the grooming API routes. */

export const json = <T>(body: T, status = 200, headers?: HeadersInit) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });

export const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  json({ ok: false, code, message, ...extra }, status);

/** Body as JSON with a size cap; null when missing, too big or not JSON. */
export async function readJsonBody(req: NextRequest, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) return null;
  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > maxBytes) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const clientIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";

// ---- throttle (per server instance; enough to slow down a script) ------------------

const hits = new Map<string, number[]>();

/** True when this key has made `max` requests in the last `windowMs`. Records the hit otherwise. */
export function throttled(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear(); // bound memory
  return false;
}

/** The public grooming page shows admin-managed content: refresh it after a change. */
export function refreshGroomingPage() {
  try {
    revalidatePath("/grooming");
  } catch {
    /* outside a request (tests): nothing cached to refresh */
  }
}

// ---- photos ---------------------------------------------------------------------------

/** Under Netlify's ~6 MB function request limit; the admin page downsizes big photos first. */
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const ACCEPTED = new Set(["jpeg", "png", "webp", "avif", "heif"]);

export class MediaError extends Error {}

/**
 * Decodes the upload with sharp (so only real images pass; the name and
 * reported type aren't trusted), fixes rotation, strips metadata and stores a
 * 1200×1500 JPEG under a content-hash name. Returns its public src.
 */
export async function storeGroomingPhoto(store: GroomingStore, input: Buffer, fit: "cover" | "contain" = "cover"): Promise<string> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 60_000_000 }).metadata();
  } catch {
    throw new MediaError("That file isn't an image we can read.");
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) throw new MediaError("Upload a JPEG, PNG, WebP or AVIF image.");
  if ((meta.width ?? 0) < 400 || (meta.height ?? 0) < 400) throw new MediaError("The photo is too small (at least 400×400 px).");
  const jpeg = await sharp(input, { limitInputPixels: 60_000_000 })
    .rotate()
    .resize(1200, 1500, fit === "cover" ? { fit: "cover", position: sharp.strategy.attention } : { fit: "contain", background: "#F5F0E5" })
    .flatten({ background: "#F5F0E5" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const name = `${createHash("sha256").update(jpeg).digest("hex")}.jpg`;
  await store.writeBinary(`media/${name}`, jpeg);
  return `/api/grooming/media/${name}`;
}
