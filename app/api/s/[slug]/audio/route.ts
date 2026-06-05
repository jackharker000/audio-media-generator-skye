import { serveSharedSongAudio } from "@/server/audio";

export const runtime = "nodejs";

/** Audio for a shared song, authorized by the (unguessable) share slug. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  return serveSharedSongAudio(req, slug);
}
