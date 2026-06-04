import { COLLECTIONS, getDb } from "@/db";
import { requireUser, ok, fail, guard } from "@/server/http";
import { getSong } from "@/server/service";
import type { SongVisibility } from "@/db/types";

export const runtime = "nodejs";

const VALID: SongVisibility[] = ["private", "friends", "public"];

/** Owner-gated update of a song's visibility (and the legacy isPublic flag). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const visibility = body.visibility as SongVisibility;
  if (!VALID.includes(visibility)) return fail("Invalid visibility.");

  return guard(async () => {
    const song = await getSong(u.userId, id);
    if (!song) return fail("Song not found", 404);
    await getDb()
      .collection(COLLECTIONS.songs)
      .doc(id)
      .update({
        visibility,
        isPublic: visibility === "public",
        updatedAt: Date.now(),
      });
    return ok({ ok: true, visibility });
  });
}
