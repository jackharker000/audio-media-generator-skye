import { COLLECTIONS } from "@/db";
import { col } from "@/db/helpers";
import type { DbSong } from "@/db/types";
import { currentUserId } from "@/auth/auth";
import { canViewSong } from "@/server/friends";
import { getContentType, getObjectBuffer, getReadUrl, storageBackend } from "@/storage";

/**
 * Loads a song and streams (or redirects to) its audio, gated by a single
 * source of truth — {@link canViewSong}, which honors owner, public, the legacy
 * `isPublic` flag, and friends-only visibility. Shared by the owner and the
 * friend/public audio routes so the access rules can't drift between them.
 */
export async function serveSongAudio(req: Request, songId: string): Promise<Response> {
  const snap = await col(COLLECTIONS.songs).doc(songId).get();
  if (!snap.exists) return new Response("Not found", { status: 404 });
  const song = { id: snap.id, ...snap.data() } as DbSong;
  if (!song.audioStorageKey) return new Response("Not found", { status: 404 });

  const userId = await currentUserId();
  if (!(await canViewSong(userId, song))) {
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
    const safeTitle = song.title.replace(/[^a-z0-9]+/gi, "_");
    headers["Content-Disposition"] = `attachment; filename="${safeTitle}.${ext}"`;
  }
  return new Response(new Uint8Array(buf), { headers });
}
