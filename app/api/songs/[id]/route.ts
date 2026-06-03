import { requireUser, ok, fail } from "@/server/http";
import { getSong } from "@/server/service";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  const song = await getSong(u.userId, id);
  if (!song) return fail("Song not found", 404);
  return ok(song);
}
