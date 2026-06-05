import { currentUserId } from "@/auth/auth";
import { getJob } from "@/server/service";
import { startIfNeeded } from "@/pipeline/runner";

export const runtime = "nodejs";
// The pipeline runs inside this request; keep the function alive up to the cap.
export const maxDuration = 300;

/**
 * Server-Sent Events stream of a job's stage-by-stage progress. Opening this
 * stream also DRIVES the pipeline (Google TTS music is synchronous, so there's
 * nothing async to wait on) — which is what keeps it Vercel-friendly without an
 * external orchestrator. The stream closes on success/failure.
 */
// ~maxDuration worth of 1.5s polls; stays just under the 300s function cap so
// the loop bound and the platform timeout agree (was 1200 ticks = 30 min).
const POLL_MS = 1500;
const MAX_TICKS = 190;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  // Verify ownership before doing any work.
  const initial = await getJob(userId, id);
  if (!initial) return new Response("Not found", { status: 404 });

  // Start (or resume) the pipeline; runs concurrently while we stream progress.
  startIfNeeded(id).catch(() => {});

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true; // controller closed (client gone) — stop sending
        }
      };
      try {
        for (let i = 0; i < MAX_TICKS; i++) {
          if (req.signal.aborted || closed) break; // client disconnected
          const job = await getJob(userId, id);
          if (!job) {
            send({ error: "not found" });
            break;
          }
          send({
            status: job.status,
            currentStage: job.currentStage,
            stageStates: job.stageStates,
            songId: job.songId,
            error: job.error,
          });
          if (closed || job.status === "succeeded" || job.status === "failed") break;
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
      } catch (e) {
        send({ error: (e as Error).message });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
