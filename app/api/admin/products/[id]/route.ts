import { NextResponse, type NextRequest } from "next/server";
import { deleteProduct, updateProduct } from "@/lib/catalog-core/admin-ops";
import { guardAdminApi } from "@/lib/server/admin-auth";
import { assetStore, catalogStore } from "@/lib/server/catalog-admin";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const { id } = await params;
  const product = (await catalogStore.read()).products.find((p) => p.id === id);
  return product
    ? NextResponse.json({ ok: true, product })
    : NextResponse.json({ ok: false, code: "not_found", message: "That product doesn't exist." }, { status: 404 });
}

/** Edit: { expectedUpdatedAt, fields }. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { expectedUpdatedAt?: unknown; fields?: unknown } | null;
  const result = await updateProduct(catalogStore, assetStore, id, body?.expectedUpdatedAt, body?.fields);
  return NextResponse.json(result, { status: result.ok ? 200 : result.status });
}

/** Delete a draft/archived product: { confirmId } must equal the id. Image files are kept. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { confirmId?: unknown } | null;
  const result = await deleteProduct(catalogStore, id, body?.confirmId);
  return NextResponse.json(result, { status: result.ok ? 200 : result.status });
}
