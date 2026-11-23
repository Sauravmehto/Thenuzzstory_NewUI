import { groomingStore } from "@/lib/server/grooming-store";

const FILE_RE = /^[a-f0-9]{64}\.jpg$/;

/** Grooming photos uploaded in the admin. Names are content hashes, so they never change: cache forever. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!FILE_RE.test(file)) return new Response("Not found", { status: 404 });
  const data = await (await groomingStore()).readBinary(`media/${file}`).catch(() => null);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
