import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { getProvider } from "@/music/registry";

export const runtime = "nodejs";

/**
 * fal.ai posts here when a music job finishes. We carry OUR jobId in the query
 * string (fal echoes nothing of ours), parse the provider payload for the audio
 * URL, and emit `music/completed` to wake the waiting pipeline step.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  const providerId = url.searchParams.get("provider") ?? "fal-acestep";
  if (!jobId) return NextResponse.json({ ok: false, error: "missing jobId" }, { status: 400 });

  const body = await req.json().catch(() => ({}));

  let audioUrl: string | undefined;
  let musicJobId: string | undefined;
  let error: string | undefined;
  try {
    const parsed = getProvider(providerId).parseWebhook?.(body);
    audioUrl = parsed?.audioUrl;
    musicJobId = parsed?.jobId;
    error = parsed?.error;
  } catch (e) {
    error = (e as Error).message;
  }

  await inngest.send({
    name: "music/completed",
    data: { jobId, musicJobId, audioUrl, error },
  });

  return NextResponse.json({ ok: true });
}
