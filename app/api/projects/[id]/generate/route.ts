import { requireUser, ok, guard } from "@/server/http";
import { startGeneration } from "@/server/service";
import type { JobInputParams } from "@/shared/types";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { id: projectId } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const input: JobInputParams = {
    focusPrompt: body.focusPrompt ? String(body.focusPrompt) : undefined,
    genre: body.genre ? String(body.genre) : undefined,
    voiceGender: body.voiceGender,
    voiceStyle: body.voiceStyle,
    provider: body.provider ? String(body.provider) : undefined,
    targetDurationSec: body.targetDurationSec ? Number(body.targetDurationSec) : undefined,
  };

  return guard(async () => {
    const jobId = await startGeneration(u.userId, projectId, input);
    return ok({ jobId });
  });
}
