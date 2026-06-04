import { getContentType, getObjectBuffer, storageBackend } from "@/storage";

export const runtime = "nodejs";

/** Serves objects from the Firestore / local storage backends (dev & no-bucket modes). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string[] }> },
) {
  if (storageBackend() === "gcs") {
    return new Response("Use signed Cloud Storage URLs in production", { status: 404 });
  }
  const { key } = await ctx.params;
  const path = key.map((s) => decodeURIComponent(s)).join("/");
  try {
    const buf = await getObjectBuffer(path);
    const ct = (await getContentType(path)) ?? (path.endsWith(".mp3") ? "audio/mpeg" : "application/octet-stream");
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": ct,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
