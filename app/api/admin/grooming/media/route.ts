import type { NextRequest } from "next/server";
import { guardAdminApi } from "@/lib/server/admin-auth";
import { fail, json, MAX_MEDIA_BYTES, MediaError, storeGroomingPhoto } from "@/lib/server/grooming-http";
import { groomingStore } from "@/lib/server/grooming-store";

export const dynamic = "force-dynamic";

/** Upload a grooming photo (multipart: file, fit = "cover" | "contain"). Returns { src }. */
export async function POST(req: NextRequest) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_MEDIA_BYTES + 64 * 1024) return fail(413, "too_large", "Photos must be 5 MB or smaller.");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail(400, "invalid_request", "Choose a photo to upload.");
  if (file.size > MAX_MEDIA_BYTES) return fail(413, "too_large", "Photos must be 5 MB or smaller.");
  try {
    const fit = form?.get("fit") === "contain" ? "contain" : "cover";
    const src = await storeGroomingPhoto(await groomingStore(), Buffer.from(await file.arrayBuffer()), fit);
    return json({ ok: true, src }, 201);
  } catch (err) {
    if (err instanceof MediaError) return fail(422, "invalid_image", err.message);
    console.error("[admin/grooming/media]", err);
    return fail(503, "storage_failed", "Couldn't save the photo. Please try again.");
  }
}
