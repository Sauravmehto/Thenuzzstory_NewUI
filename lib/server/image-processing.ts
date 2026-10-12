import "server-only";
import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "avif", "heif"]);

/**
 * Turns an uploaded file into the same kind of image the catalog uses:
 * a 1600×1600 JPEG. The bytes are decoded by sharp, so a file only passes if it
 * really is an image (the file name and browser-reported type are not trusted).
 *
 *   pad  : the whole photo on a white square (packshots)
 *   crop : a square crop around the most interesting part (lifestyle photos)
 */
export async function processUpload(input: Buffer, fit: "pad" | "crop"): Promise<Buffer> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 80_000_000 }).metadata();
  } catch {
    throw new UploadError("That file isn't an image we can read.");
  }
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) throw new UploadError("Upload a JPEG, PNG, WebP or AVIF image.");
  if ((meta.width ?? 0) < 300 || (meta.height ?? 0) < 300) throw new UploadError("The image is too small (at least 300×300 px).");

  const base = sharp(input, { limitInputPixels: 80_000_000 }).rotate(); // respect camera orientation
  const sized =
    fit === "pad"
      ? base.resize(1600, 1600, { fit: "contain", background: "#ffffff" })
      : base.resize(1600, 1600, { fit: "cover", position: sharp.strategy.attention });
  return sized.flatten({ background: "#ffffff" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
}

export class UploadError extends Error {}
