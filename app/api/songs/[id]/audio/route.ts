import { COLLECTIONS, getDb } from "@/db";
import type { DbSong } from "@/db/types";
import { currentUserId } from "@/auth/auth";
import { getContentType, getObjectBuffer, getReadUrl, storageBackend } from "@/storage";

export const runtime = "nodejs";

/** Resolves/serves a song's audio (signed GCS URL, or streamed from Firestore/local). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const snap = await getDb().collection(COLLECTIONS.songs).doc(id).get();
  if (!snap.exists) return new Response("Not found", { status: 404 });
  const song = { id: snap.id, ...snap.data() } as DbSong;
  if (!song.audioStorageKey) return new Response("Not found", { status: 404 });

  // Owner can always listen; others only if the song is public/shared.
  const userId = await currentUserId();
  if (song.userId !== userId && !song.isPublic) {
    return new Response("Forbidden", { status: 403 });
  }

  const download = new URL(req.url).searchParams.get("download") === "1";

  // GCS: redirect to a short-lived signed URL.
  if (storageBackend() === "gcs") {
    const url = await getReadUrl(song.audioStorageKey, { download });
    return Response.redirect(url, 302);
  }

  // Firestore / local: stream the bytes directly (keeps the auth check intact).
  const buf = await getObjectBuffer(song.audioStorageKey);
  const contentType = (await getContentType(song.audioStorageKey)) ?? "audio/mpeg";
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Length": String(buf.length),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  if (download) {
    const ext = (song.audioStorageKey.split(".").pop() || "audio").toLowerCase();
    headers["Content-Disposition"] = `attachment; filename="${song.title.replace(/[^a-z0-9]+/gi, "_")}.${ext}"`;
  }
  return new Response(new Uint8Array(buf), { headers });
}
