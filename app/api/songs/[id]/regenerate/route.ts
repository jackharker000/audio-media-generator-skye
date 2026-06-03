import { requireUser, ok, guard } from "@/server/http";
import { regenerateSong } from "@/server/service";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  return guard(async () => {
    const jobId = await regenerateSong(u.userId, id, {
      genre: body.genre,
      voiceGender: body.voiceGender,
      voiceStyle: body.voiceStyle,
      provider: body.provider,
      focusPrompt: body.focusPrompt,
    });
    return ok({ jobId });
  });
}
