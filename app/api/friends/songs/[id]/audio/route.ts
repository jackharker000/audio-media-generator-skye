import { serveSongAudio } from "@/server/audio";

export const runtime = "nodejs";

/** Serves a friend's (or public) song audio, gated by visibility/friendship. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return serveSongAudio(req, id);
}
