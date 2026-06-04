import { COLLECTIONS, getDb } from "@/db";
import type { DbSong } from "@/db/types";
import { currentUserId } from "@/auth/auth";
import { getReadUrl } from "@/storage";

export const runtime = "nodejs";

/** Resolves a song's audio to a streamable URL (signed GCS / local). */
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
  const url = await getReadUrl(song.audioStorageKey, { download });
  const dest = url.startsWith("http") ? url : new URL(url, req.url).toString();
  return Response.redirect(dest, 302);
}
