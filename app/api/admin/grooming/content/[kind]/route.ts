import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { CONTENT_LIMIT, isContentKind, parseContent } from "@/lib/grooming/content";
import type { ContentMap } from "@/lib/grooming/types";
import { guardAdminApi } from "@/lib/server/admin-auth";
import { listContent, updateContent } from "@/lib/server/grooming-config";
import { fail, json, readJsonBody, refreshGroomingPage } from "@/lib/server/grooming-http";
import { groomingStore } from "@/lib/server/grooming-store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ kind: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const { kind } = await params;
  if (!isContentKind(kind)) return fail(404, "not_found", "Unknown content type.");
  try {
    return json({ ok: true, items: await listContent(kind, await groomingStore()) });
  } catch (err) {
    console.error("[admin/grooming/content] GET", err);
    return fail(503, "storage_failed", "Couldn't load the list.");
  }
}

/** Add one item. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const { kind } = await params;
  if (!isContentKind(kind)) return fail(404, "not_found", "Unknown content type.");
  const body = (await readJsonBody(req, 20_000)) as Record<string, unknown> | null;
  if (!body) return fail(400, "invalid_request", "Nothing to save.");
  const parsed = parseContent[kind](body, { id: randomBytes(6).toString("hex"), order: 1e6 });
  if (!parsed.ok) return fail(422, "validation", Object.values(parsed.errors)[0] ?? "Check the form.", { errors: parsed.errors });
  try {
    const store = await groomingStore();
    if ((await listContent(kind, store)).length >= CONTENT_LIMIT[kind])
      return fail(409, "limit", `You can have up to ${CONTENT_LIMIT[kind]} items here. Delete one first.`);
    const items = await updateContent(kind, (list) => [...list, parsed.item as ContentMap[typeof kind]], store);
    refreshGroomingPage();
    return json({ ok: true, items }, 201);
  } catch (err) {
    console.error("[admin/grooming/content] POST", err);
    return fail(503, "storage_failed", "Couldn't save. Nothing was changed.");
  }
}

/** Reorder: { ids: [...] } in the new order. */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const { kind } = await params;
  if (!isContentKind(kind)) return fail(404, "not_found", "Unknown content type.");
  const body = (await readJsonBody(req, 20_000)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) && body.ids.every((x) => typeof x === "string") ? (body.ids as string[]) : null;
  if (!ids) return fail(400, "invalid_request", "Send the new order.");
  try {
    const rank = new Map(ids.map((id, i) => [id, i]));
    const items = await updateContent(
      kind,
      (list) => [...list].sort((a, b) => (rank.get(a.id) ?? 1e6 + a.order) - (rank.get(b.id) ?? 1e6 + b.order)),
      await groomingStore(),
    );
    refreshGroomingPage();
    return json({ ok: true, items });
  } catch (err) {
    console.error("[admin/grooming/content] PUT", err);
    return fail(503, "storage_failed", "Couldn't save the new order.");
  }
}
