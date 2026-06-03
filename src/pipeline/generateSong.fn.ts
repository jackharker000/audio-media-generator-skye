import { NonRetriableError } from "inngest";
import { inngest } from "@/inngest/client";
import { env } from "@/lib/env";
import * as store from "@/pipeline/jobStore";
import { extractSources } from "./stages/extract";
import { buildKnowledgeMap } from "./stages/knowledgeMap";
import {
  buildSongPlan,
  draftLyrics,
  critiqueLyrics,
  rewriteLyrics,
  factCheckLyrics,
  buildMusicRequest,
  makeTitle,
  dropContradictedLines,
  draftFromText,
} from "./stages/songwriting";
import { resolveProviderChain } from "@/music/registry";
import { fetchExternalToBlob } from "@/storage";
import type { StageName } from "@/shared/types";
import type { LyricDraft, MusicRequest } from "@/agents/schemas";

const nowIso = () => new Date().toISOString();

// Inngest's step type is heavily generic/overloaded; the orchestration below
// uses the documented step API (run/waitForEvent/sleep), so we keep it loose.
type AnyStep = any;

/** Wrap a stage in a memoized, retryable step that also records its status. */
async function runStage<T>(
  step: AnyStep,
  jobId: string,
  stepId: string,
  stage: StageName,
  fn: () => Promise<T>,
): Promise<T> {
  return (await step.run(stepId, async () => {
    await store.setStage(jobId, stage, { status: "running", startedAt: nowIso() });
    try {
      const out = await fn();
      await store.setStage(jobId, stage, { status: "done", finishedAt: nowIso() });
      return out;
    } catch (e) {
      await store.setStage(jobId, stage, {
        status: "error",
        error: String((e as Error)?.message ?? e),
      });
      throw e;
    }
  })) as T;
}

interface MusicOutcome {
  audioUrl?: string;
  r2Key?: string;
  providerId: string;
}

/** Stage 10 — try the provider chain. Sync providers render inline; async ones
 * submit + wait on a webhook (or poll), with fallback to the next provider. */
async function runMusicStage(
  step: AnyStep,
  jobId: string,
  req: MusicRequest,
  requestedProvider?: string,
): Promise<MusicOutcome> {
  await store.setStage(jobId, "music", { status: "running", startedAt: nowIso() });
  const chain = resolveProviderChain(requestedProvider);

  for (const provider of chain) {
    try {
      if (provider.capabilities.mode === "sync") {
        const result = (await step.run(`music-sync-${provider.id}`, () =>
          provider.render!(req, { jobId }),
        )) as { r2Key?: string; audioUrl?: string };
        await store.setStage(jobId, "music", { status: "done", finishedAt: nowIso() });
        return { ...result, providerId: provider.id };
      }

      // Async provider: submit, persist the job id, then wait.
      const webhookUrl = `${env.appUrl()}/api/webhooks/fal?jobId=${encodeURIComponent(
        jobId,
      )}&provider=${encodeURIComponent(provider.id)}`;
      const submit = (await step.run(`music-submit-${provider.id}`, () =>
        provider.submit!(req, { webhookUrl }),
      )) as { jobId: string };
      await step.run(`music-setjob-${provider.id}`, () =>
        store.setMusicJob(jobId, provider.id, submit.jobId),
      );

      if (provider.capabilities.mode === "async-webhook") {
        const evt = await step.waitForEvent(`music-wait-${provider.id}`, {
          event: "music/completed",
          timeout: "30m",
          match: "data.jobId",
        });
        if (evt && !evt.data.error && evt.data.audioUrl) {
          await store.setStage(jobId, "music", { status: "done", finishedAt: nowIso() });
          return { audioUrl: evt.data.audioUrl, providerId: provider.id };
        }
        // Missed/failed webhook → one direct poll before falling back.
        if (provider.poll) {
          const polled = (await step.run(`music-poll-${provider.id}`, () =>
            provider.poll!(submit.jobId),
          )) as { status: string; result?: { audioUrl?: string } };
          if (polled.status === "done" && polled.result?.audioUrl) {
            await store.setStage(jobId, "music", { status: "done", finishedAt: nowIso() });
            return { audioUrl: polled.result.audioUrl, providerId: provider.id };
          }
        }
      } else if (provider.poll) {
        // async-poll
        for (let i = 0; i < 60; i++) {
          const polled = (await step.run(`music-poll-${provider.id}-${i}`, () =>
            provider.poll!(submit.jobId),
          )) as { status: string; result?: { audioUrl?: string } };
          if (polled.status === "done" && polled.result?.audioUrl) {
            await store.setStage(jobId, "music", { status: "done", finishedAt: nowIso() });
            return { audioUrl: polled.result.audioUrl, providerId: provider.id };
          }
          if (polled.status === "error") break;
          await step.sleep(`music-sleep-${provider.id}-${i}`, "5s");
        }
      }
    } catch {
      // Try the next provider in the chain.
    }
  }

  await store.setStage(jobId, "music", { status: "error", error: "all providers failed" });
  throw new NonRetriableError("All music providers failed to generate audio.");
}

export const generateSong = inngest.createFunction(
  {
    id: "generate-song",
    name: "Generate memorization song",
    concurrency: { limit: 3 }, // respect Gemini RPM + Inngest free concurrency
    retries: 2,
    onFailure: async ({ event }) => {
      const jobId =
        (event as any)?.data?.event?.data?.jobId ?? (event as any)?.data?.jobId;
      const message =
        (event as any)?.data?.error?.message ?? "Generation failed unexpectedly.";
      if (jobId) await store.markFailed(jobId, String(message));
    },
  },
  { event: "song/generate.requested" },
  async ({ event, step }) => {
    const jobId = (event as { data: { jobId: string } }).data.jobId;

    // step.run JSON-serializes results (Date→string); cast back to our type.
    // The pipeline only reads non-Date fields off the bundle.
    const bundle = (await step.run("load-job", () =>
      store.loadJobBundle(jobId),
    )) as unknown as store.JobBundle;
    await step.run("mark-running", () => store.markRunning(jobId));
    const input = bundle.job.inputParams;

    // Stage 2: extract
    const extracted = await runStage(step, jobId, "extract", "extract", () =>
      extractSources(bundle.sources),
    );

    // Stage 3: knowledge map (reuse when regenerating)
    let knowledgeMapId = input.reuseKnowledgeMapId;
    const km = knowledgeMapId
      ? await step.run("km-reuse", () => store.getKnowledgeMapById(knowledgeMapId!))
      : await runStage(step, jobId, "knowledge_map", "knowledge_map", () =>
          buildKnowledgeMap(extracted.normalizedText, input.focusPrompt),
        );
    if (!knowledgeMapId) {
      knowledgeMapId = await step.run("save-km", () =>
        store.saveKnowledgeMap(bundle.job.projectId, km, extracted.sourceHash),
      );
      await step.run("set-km-id", () => store.setKnowledgeMapId(jobId, knowledgeMapId!));
    }

    // Stage 4: plan
    const plan = await runStage(step, jobId, "song_plan", "song_plan", () =>
      buildSongPlan(km, input),
    );

    // Stage 5: lyric draft (or user-provided lyrics in edit flow)
    let draft: LyricDraft = input.lyricsOverride
      ? draftFromText(input.lyricsOverride)
      : await runStage(step, jobId, "lyric_draft", "lyric_draft", () => draftLyrics(plan, km));

    // Stages 6-7: bounded critique → rewrite loop
    const maxRewrites = env.maxRewrites();
    for (let i = 0; i <= maxRewrites; i++) {
      const critique = await runStage(step, jobId, `critique-${i}`, "critique", () =>
        critiqueLyrics(draft, km, plan, input),
      );
      if (critique.pass || i === maxRewrites) break;
      draft = await runStage(step, jobId, `rewrite-${i}`, "rewrite", () =>
        rewriteLyrics(draft, km, plan, critique),
      );
    }

    // Stage 8: independent fact-check gate
    const grounding = await runStage(step, jobId, "fact_check", "fact_check", () =>
      factCheckLyrics(draft, km),
    );
    if (grounding.hardFail) {
      const repaired = dropContradictedLines(draft, grounding);
      const recheck = await runStage(step, jobId, "fact_check_recheck", "fact_check", () =>
        factCheckLyrics(repaired, km),
      );
      if (recheck.hardFail) {
        throw new NonRetriableError(
          "Couldn't verify some lyrics against your sources. Try narrowing the focus or providing clearer source text.",
        );
      }
      draft = repaired;
    }

    // Stage 9: style params
    const musicReq = await runStage(step, jobId, "style_params", "style_params", () =>
      buildMusicRequest(plan, draft, input),
    );

    // Stage 10: music
    const music = await runMusicStage(step, jobId, musicReq, input.provider);

    // Stage 11: post-process (title + ensure audio is in our storage)
    const meta = await runStage(step, jobId, "post_process", "post_process", () =>
      makeTitle(plan, draft),
    );
    const audioKey = await step.run("store-audio", async () => {
      if (music.r2Key) return music.r2Key;
      const key = `songs/${jobId}.mp3`;
      await fetchExternalToBlob(music.audioUrl!, key);
      return key;
    });

    // Stage 12: finalize
    const songId = await runStage(step, jobId, "finalize", "finalize", () =>
      store.createSongAndFinish({
        jobId,
        bundle,
        knowledgeMapId,
        plan,
        draft,
        musicReq,
        meta,
        audioKey,
        providerId: music.providerId,
      }),
    );

    return { songId };
  },
);
