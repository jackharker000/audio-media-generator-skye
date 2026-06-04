import { COLLECTIONS, getDb } from "@/db";
import { env } from "@/lib/env";
import * as store from "./jobStore";
import { friendlyError } from "./errors";
import { extractSources } from "./stages/extract";
import { buildKnowledgeMap } from "./stages/knowledgeMap";
import {
  buildSongPlan,
  draftLyrics,
  buildMusicRequest,
  makeTitle,
  draftFromText,
} from "./stages/songwriting";
import { refineAndVerify, type StageRunner } from "./refine";
import { resolveProvider } from "@/music/registry";
import { fetchExternalToBlob, objectExists } from "@/storage";
import type { LyricDraft } from "@/agents/schemas";
import type { PipelineCheckpoint, StageName } from "@/shared/types";

const nowIso = () => new Date().toISOString();

/** Run a stage, recording running/done/error status in Firestore. */
async function runStage<T>(jobId: string, stage: StageName, fn: () => Promise<T>): Promise<T> {
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
}

/**
 * Executes the full generation pipeline in-process (Google TTS is synchronous,
 * so there's nothing to wait on). Each expensive stage is checkpointed to
 * Firestore, so a re-driven job resumes where it left off instead of restarting
 * and re-spending quota.
 */
export async function runPipeline(jobId: string): Promise<void> {
  try {
    const bundle = await store.loadJobBundle(jobId);
    const input = bundle.job.inputParams;
    const cp: PipelineCheckpoint = { ...(bundle.job.checkpoint ?? {}) };
    const provider = resolveProvider(input.provider);
    const saveCp = async (patch: Partial<PipelineCheckpoint>) => {
      Object.assign(cp, patch);
      await store.saveCheckpoint(jobId, cp);
    };

    // 2. extract (local, cheap — always run)
    const extracted = await runStage(jobId, "extract", () => extractSources(bundle.sources));

    // 3. knowledge map (reuse if the job already has one)
    let knowledgeMapId = bundle.job.knowledgeMapId ?? input.reuseKnowledgeMapId ?? undefined;
    const km = knowledgeMapId
      ? await store.getKnowledgeMapById(knowledgeMapId)
      : await runStage(jobId, "knowledge_map", () =>
          buildKnowledgeMap(extracted.normalizedText, input.focusPrompt),
        );
    if (!knowledgeMapId) {
      knowledgeMapId = await store.saveKnowledgeMap(bundle.job.projectId, km, extracted.sourceHash);
      await store.setKnowledgeMapId(jobId, knowledgeMapId);
    }

    // 4. plan
    let plan = cp.plan;
    if (!plan) {
      plan = await runStage(jobId, "song_plan", () => buildSongPlan(km, input));
      await saveCp({ plan });
    }

    // 5-8. draft + critique/rewrite loop + fact-check gate (the expensive block)
    let draft: LyricDraft | undefined = cp.draft;
    if (!draft) {
      const base = input.lyricsOverride
        ? draftFromText(input.lyricsOverride)
        : await runStage(jobId, "lyric_draft", () => draftLyrics(plan!, km));
      const runner: StageRunner = { run: (_id, stage, fn) => runStage(jobId, stage, fn) };
      draft = await refineAndVerify(runner, {
        draft: base,
        km,
        plan,
        input,
        maxRewrites: env.maxRewrites(),
      });
      await saveCp({ draft });
    }

    // 9. style params
    let musicReq = cp.musicReq;
    if (!musicReq) {
      musicReq = await runStage(jobId, "style_params", () => buildMusicRequest(plan!, draft!, input));
      await saveCp({ musicReq });
    }

    // 10. music — skip if audio was already rendered and is still present
    let audioKey = cp.audioKey;
    if (!audioKey || !(await objectExists(audioKey))) {
      audioKey = await runStage(jobId, "music", async () => {
        if (!provider.render) throw new Error(`Provider ${provider.id} cannot render audio`);
        const music = await provider.render(musicReq!, { jobId });
        const ext = (music.contentType ?? "").includes("wav") ? "wav" : "mp3";
        const key = music.storageKey ?? `songs/${jobId}.${ext}`;
        if (!music.storageKey && music.audioUrl) await fetchExternalToBlob(music.audioUrl, key);
        return key;
      });
      await saveCp({ audioKey });
    }

    // 11. post-process: title
    let meta = cp.meta;
    if (!meta) {
      meta = await runStage(jobId, "post_process", () => makeTitle(plan!, draft!));
      await saveCp({ meta });
    }

    // 12. finalize
    await runStage(jobId, "finalize", () =>
      store.createSongAndFinish({
        jobId,
        bundle,
        knowledgeMapId,
        plan,
        draft,
        musicReq,
        meta,
        audioKey,
        providerId: provider.id,
      }),
    );
  } catch (e) {
    await store.markFailed(jobId, friendlyError(e));
  }
}

// ---- Start guard ----------------------------------------------------------

const STALE_MS = 180_000; // re-drive a "running" job if untouched this long
const inFlight = new Set<string>();

/**
 * Idempotently start (or resume) a job's pipeline. Driven by the SSE stream
 * endpoint, which keeps the serverless function alive while it runs. A Firestore
 * transaction (plus an in-memory guard) ensures only one runner executes.
 */
export async function startIfNeeded(jobId: string): Promise<"started" | "running" | "done" | "missing"> {
  if (inFlight.has(jobId)) return "running";

  const ref = getDb().collection(COLLECTIONS.jobs).doc(jobId);
  const state: { d: "start" | "skip" | "done" | "missing" } = { d: "skip" };

  await getDb().runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) {
      state.d = "missing";
      return;
    }
    const j = snap.data()!;
    if (j.status === "succeeded" || j.status === "failed") {
      state.d = "done";
      return;
    }
    const now = Date.now();
    if (j.status === "queued") {
      t.update(ref, { status: "running", updatedAt: now });
      state.d = "start";
    } else if (j.status === "running" && now - (j.updatedAt ?? 0) > STALE_MS) {
      t.update(ref, { updatedAt: now });
      state.d = "start"; // previous runner appears to have died — resume it
    }
  });

  if (state.d === "start") {
    inFlight.add(jobId);
    void runPipeline(jobId).finally(() => inFlight.delete(jobId));
    return "started";
  }
  if (state.d === "missing") return "missing";
  if (state.d === "done") return "done";
  return "running";
}
