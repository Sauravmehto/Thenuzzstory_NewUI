import { NextResponse, type NextRequest } from "next/server";
import { applyImport, planImport, readManifest } from "@/lib/catalog-core/importer";
import { guardAdminApi } from "@/lib/server/admin-auth";
import { assetStore, catalogStore } from "@/lib/server/catalog-admin";

export const dynamic = "force-dynamic";

async function plan() {
  return planImport({ manifest: await readManifest(process.cwd()), catalog: await catalogStore.read(), assets: assetStore });
}

/** Preview: what the manifest import would create, skip or reject. Writes nothing. */
export async function GET(req: NextRequest) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const { items, counts, manifestVersion } = await plan();
  return NextResponse.json({
    ok: true,
    manifestVersion,
    counts,
    items: items.map(({ product: _draft, ...summary }) => summary),
  });
}

/** Import the approved ids as drafts: { ids }. The plan is rebuilt here, never taken from the client. */
export async function POST(req: NextRequest) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  if (!Array.isArray(body?.ids) || !body.ids.every((id) => typeof id === "string"))
    return NextResponse.json({ ok: false, code: "invalid_request", message: "Choose which products to import." }, { status: 400 });
  const report = await applyImport(catalogStore, await plan(), body.ids as string[]);
  return NextResponse.json({ ok: true, report });
}
