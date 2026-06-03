import { currentUserId } from "@/auth/auth";
import { getJob } from "@/server/service";

export const runtime = "nodejs";

/**
 * Server-Sent Events stream of a job's stage-by-stage progress. The frontend
 * subscribes and renders a live checklist; the stream closes on success/failure.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        for (let i = 0; i < 1200; i++) {
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
          if (job.status === "succeeded" || job.status === "failed") break;
          await new Promise((r) => setTimeout(r, 1500));
        }
      } catch (e) {
        send({ error: (e as Error).message });
      } finally {
        controller.close();
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
