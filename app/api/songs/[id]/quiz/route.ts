import { requireUser, ok, guard } from "@/server/http";
import { getOrCreateQuiz } from "@/server/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Generate (and cache) a multiple-choice recall quiz from the song's facts. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (u instanceof Response) return u;
  const { id } = await ctx.params;
  return guard(async () => ok({ questions: await getOrCreateQuiz(u.userId, id) }));
}
