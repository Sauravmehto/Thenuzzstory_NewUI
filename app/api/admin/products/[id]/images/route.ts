import { NextResponse, type NextRequest } from "next/server";
import { IMAGE_VIEWS, isValidId } from "@/lib/catalog-core/schema";
import { guardAdminApi } from "@/lib/server/admin-auth";
import { assetStore, catalogStore } from "@/lib/server/catalog-admin";
import { MAX_UPLOAD_BYTES, processUpload, UploadError } from "@/lib/server/image-processing";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

async function productExists(id: string) {
  return isValidId(id) && (await catalogStore.read()).products.some((p) => p.id === id);
}

/** Image files already stored in this product's folder (to pick from). */
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const { id } = await params;
  if (!(await productExists(id)))
    return NextResponse.json({ ok: false, code: "not_found", message: "That product doesn't exist." }, { status: 404 });
  return NextResponse.json({ ok: true, files: await assetStore.listProductImages(id) });
}

/**
 * Upload (multipart): file, view, fit ("pad" | "crop").
 * Returns the stored image path; it joins the gallery when the product is saved.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const { id } = await params;
  if (!(await productExists(id)))
    return NextResponse.json({ ok: false, code: "not_found", message: "Save the product first, then add images." }, { status: 404 });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024)
    return NextResponse.json({ ok: false, code: "too_large", message: "Images must be 15 MB or smaller." }, { status: 413 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ ok: false, code: "invalid_request", message: "Choose an image to upload." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES)
    return NextResponse.json({ ok: false, code: "too_large", message: "Images must be 15 MB or smaller." }, { status: 413 });
  const view = String(form?.get("view") ?? "other");
  const fit = form?.get("fit") === "crop" ? "crop" : "pad";

  try {
    const jpeg = await processUpload(Buffer.from(await file.arrayBuffer()), fit);
    const base = (IMAGE_VIEWS as readonly string[]).includes(view) ? view : "upload";
    const src = await assetStore.saveProductImage(id, base, jpeg, "jpg");
    return NextResponse.json({ ok: true, src }, { status: 201 });
  } catch (err) {
    if (err instanceof UploadError)
      return NextResponse.json({ ok: false, code: "invalid_image", message: err.message }, { status: 422 });
    throw err;
  }
}
