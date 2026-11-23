import type { NextRequest } from "next/server";
import { isContentKind, parseContent } from "@/lib/grooming/content";
import { instagramPermalink } from "@/lib/grooming/instagram";
import type { GroomingVideo } from "@/lib/grooming/types";
import { guardAdminApi } from "@/lib/server/admin-auth";
import { listContent, updateContent } from "@/lib/server/grooming-config";
import { fail, json, readJsonBody, refreshGroomingPage } from "@/lib/server/grooming-http";
import { groomingStore } from "@/lib/server/grooming-store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ kind: string; id: string }> };

/** Edit one item: the whole item, or just some fields (e.g. { active: false }). */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const { kind, id } = await params;
  if (!isContentKind(kind)) return fail(404, "not_found", "Unknown content type.");
  const body = (await readJsonBody(req, 20_000)) as Record<string, unknown> | null;
  if (!body) return fail(400, "invalid_request", "Nothing to save.");
  try {
    const store = await groomingStore();
    const current = (await listContent(kind, store)).find((i) => i.id === id);
    if (!current) return fail(404, "not_found", "That item no longer exists.");
    const merged: Record<string, unknown> = { ...current, ...body };
    if (kind === "videos" && !("url" in body)) {
      const v = current as GroomingVideo;
      merged.url = instagramPermalink(v.kind, v.shortcode);
    }
    const parsed = parseContent[kind](merged, { id, order: current.order });
    if (!parsed.ok) return fail(422, "validation", Object.values(parsed.errors)[0] ?? "Check the form.", { errors: parsed.errors });
    const items = await updateContent(kind, (list) => list.map((i) => (i.id === id ? (parsed.item as typeof i) : i)), store);
    refreshGroomingPage();
    return json({ ok: true, items });
  } catch (err) {
    console.error("[admin/grooming/content/id] PATCH", err);
    return fail(503, "storage_failed", "Couldn't save. Nothing was changed.");
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = guardAdminApi(req);
  if (denied) return denied;
  const { kind, id } = await params;
  if (!isContentKind(kind)) return fail(404, "not_found", "Unknown content type.");
  try {
    const items = await updateContent(kind, (list) => list.filter((i) => i.id !== id), await groomingStore());
    refreshGroomingPage();
    return json({ ok: true, items });
  } catch (err) {
    console.error("[admin/grooming/content/id] DELETE", err);
    return fail(503, "storage_failed", "Couldn't delete. Nothing was changed.");
  }
}
