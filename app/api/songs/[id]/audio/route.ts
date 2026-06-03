import { eq } from "drizzle-orm";
import { db } from "@/db";
import { songs } from "@/db/schema";
import { currentUserId } from "@/auth/auth";
import { getReadUrl } from "@/storage";

export const runtime = "nodejs";

/** Resolves a song's audio to a streamable URL (signed R2 / public / local). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [song] = await db.select().from(songs).where(eq(songs.id, id));
  if (!song || !song.audioR2Key) return new Response("Not found", { status: 404 });

  // Owner can always listen; others only if the song is public/shared.
  const userId = await currentUserId();
  if (song.userId !== userId && !song.isPublic) {
    return new Response("Forbidden", { status: 403 });
  }

  const download = new URL(req.url).searchParams.get("download") === "1";
  const url = await getReadUrl(song.audioR2Key, { download });
  const dest = url.startsWith("http") ? url : new URL(url, req.url).toString();
  return Response.redirect(dest, 302);
}
