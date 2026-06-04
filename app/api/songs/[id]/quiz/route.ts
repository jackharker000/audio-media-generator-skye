import { currentUserId } from "@/auth/auth";
import { ok, guard } from "@/server/http";
import { getOrCreateQuizForViewer } from "@/server/service";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Generate (and cache) a multiple-choice recall quiz from the song's facts.
 * Available to anyone allowed to view the song (owner, friend, or public share),
 * gated by visibility — the quiz is cached on the song after the first build.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const viewerId = await currentUserId();
  return guard(async () => ok({ questions: await getOrCreateQuizForViewer(viewerId, id) }));
}
