import { ok, guard } from "@/server/http";
import { getOrCreateQuizForShare } from "@/server/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Recall quiz for a shared song, authorized by the (unguessable) share slug. */
export async function POST(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return guard(async () => ok({ questions: await getOrCreateQuizForShare(slug) }));
}
