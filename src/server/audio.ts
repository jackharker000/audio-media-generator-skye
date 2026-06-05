import { COLLECTIONS } from "@/db";
import { col, withId } from "@/db/helpers";
import type { DbShare, DbSong } from "@/db/types";
import { currentUserId } from "@/auth/auth";
import { canViewSong } from "@/server/friends";
import { parseRange } from "@/server/httpRange";
import { getContentType, getObjectBuffer, getReadUrl, storageBackend } from "@/storage";

/** Stream (or redirect to) the audio for an already-authorized song. */
async function respondWithAudio(req: Request, song: DbSong): Promise<Response> {
  if (!song.audioStorageKey) return new Response("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";

  // GCS: redirect to a short-lived signed URL (GCS handles range itself).
  if (storageBackend() === "gcs") {
    const url = await getReadUrl(song.audioStorageKey, { download });
    return Response.redirect(url, 302);
  }

  // Firestore / local: stream the bytes directly (keeps the auth check intact).
  const buf = await getObjectBuffer(song.audioStorageKey);
  const contentType = (await getContentType(song.audioStorageKey)) ?? "audio/mpeg";
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  };
  if (download) {
    const ext = (song.audioStorageKey.split(".").pop() || "audio").toLowerCase();
    const safeTitle = song.title.replace(/[^a-z0-9]+/gi, "_");
    headers["Content-Disposition"] = `attachment; filename="${safeTitle}.${ext}"`;
  }

  // Honor Range requests so browsers (esp. Safari/iOS) can seek in the <audio>.
  const range = download ? null : parseRange(req.headers.get("range"), buf.length);
  if (range === "unsatisfiable") {
    return new Response("Requested Range Not Satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${buf.length}`, "Accept-Ranges": "bytes" },
    });
  }
  if (range) {
    const slice = buf.subarray(range.start, range.end + 1);
    return new Response(new Uint8Array(slice), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${range.start}-${range.end}/${buf.length}`,
        "Content-Length": String(slice.length),
      },
    });
  }

  return new Response(new Uint8Array(buf), {
    headers: { ...headers, "Content-Length": String(buf.length) },
  });
}

/**
 * Loads a song and serves its audio, gated by a single source of truth —
 * {@link canViewSong} (owner, public, legacy `isPublic`, or friends). Shared by
 * the owner and the friend/public audio routes so access rules can't drift.
 */
export async function serveSongAudio(req: Request, songId: string): Promise<Response> {
  const snap = await col(COLLECTIONS.songs).doc(songId).get();
  if (!snap.exists) return new Response("Not found", { status: 404 });
  const song = withId<DbSong>(snap);

  const userId = await currentUserId();
  if (!(await canViewSong(userId, song))) {
    return new Response("Forbidden", { status: 403 });
  }
  return respondWithAudio(req, song);
}

/**
 * Serves the audio of a shared song, authorized purely by possession of the
 * (unguessable) share slug — so both "unlisted" and "public" share links play,
 * without relying on the global `isPublic` flag.
 */
export async function serveSharedSongAudio(req: Request, slug: string): Promise<Response> {
  const shareSnap = await col(COLLECTIONS.shares).where("slug", "==", slug).limit(1).get();
  if (shareSnap.empty) return new Response("Not found", { status: 404 });
  const share = withId<DbShare>(shareSnap.docs[0]);
  if (share.expiresAt && share.expiresAt < Date.now()) {
    return new Response("Not found", { status: 404 });
  }
  const songSnap = await col(COLLECTIONS.songs).doc(share.songId).get();
  if (!songSnap.exists) return new Response("Not found", { status: 404 });
  return respondWithAudio(req, withId<DbSong>(songSnap));
}
