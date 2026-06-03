import { requireUser, ok, fail, guard } from "@/server/http";
import { editSong } from "@/server/service";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  if (!body.lyrics || !String(body.lyrics).trim()) return fail("Lyrics required");
  return guard(async () => {
    const jobId = await editSong(u.userId, id, {
      lyrics: String(body.lyrics),
      genre: body.genre,
      voiceGender: body.voiceGender,
    });
    return ok({ jobId });
  });
}
