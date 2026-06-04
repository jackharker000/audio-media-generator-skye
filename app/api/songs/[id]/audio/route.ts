import { serveSongAudio } from "@/server/audio";

export const runtime = "nodejs";

/** Resolves/serves a song's audio (signed GCS URL, or streamed from Firestore/local). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return serveSongAudio(req, id);
}
