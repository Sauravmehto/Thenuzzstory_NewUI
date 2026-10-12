import { NextResponse, type NextRequest } from "next/server";
import { createProduct } from "@/lib/catalog-core/admin-ops";
import { guardAdminApi } from "@/lib/server/admin-auth";
import { assetStore, catalogStore } from "@/lib/server/catalog-admin";

export const dynamic = "force-dynamic";

/** Full catalog for the admin (all statuses). */
export async function GET(req: NextRequest) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const file = await catalogStore.read();
  return NextResponse.json({ ok: true, revision: file.revision, products: file.products });
}

/** Create a draft: { fields }. */
export async function POST(req: NextRequest) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { fields?: unknown } | null;
  const result = await createProduct(catalogStore, assetStore, body?.fields);
  return NextResponse.json(result, { status: result.ok ? 201 : result.status });
}
