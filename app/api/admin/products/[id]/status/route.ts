import { NextResponse, type NextRequest } from "next/server";
import { changeStatus } from "@/lib/catalog-core/admin-ops";
import { guardAdminApi } from "@/lib/server/admin-auth";
import { catalogStore } from "@/lib/server/catalog-admin";

export const dynamic = "force-dynamic";

/** { action: "publish" | "unpublish" | "archive" | "restore", expectedUpdatedAt } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: unknown; expectedUpdatedAt?: unknown } | null;
  const result = await changeStatus(catalogStore, id, body?.expectedUpdatedAt, body?.action);
  return NextResponse.json(result, { status: result.ok ? 200 : result.status });
}
