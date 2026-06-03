import { requireUser, ok, fail } from "@/server/http";
import { getJob } from "@/server/service";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  const job = await getJob(u.userId, id);
  if (!job) return fail("Job not found", 404);
  return ok({
    id: job.id,
    status: job.status,
    currentStage: job.currentStage,
    stageStates: job.stageStates,
    songId: job.songId,
    error: job.error,
  });
}
