import { COLLECTIONS, getDb } from "@/db";
import { env } from "@/lib/env";
import * as store from "./jobStore";
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
import { fetchExternalToBlob } from "@/storage";
import type { LyricDraft } from "@/agents/schemas";
import type { StageName } from "@/shared/types";

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
 * Executes the full generation pipeline in-process. Music is synchronous
 * (Google TTS), so there is nothing to wait on — no external orchestrator
 * needed. Stage status is persisted so the SSE stream can report progress.
 */
export async function runPipeline(jobId: string): Promise<void> {
  try {
    const bundle = await store.loadJobBundle(jobId);
    const input = bundle.job.inputParams;
    const provider = resolveProvider(input.provider);

    // 2. extract (local-first)
    const extracted = await runStage(jobId, "extract", () => extractSources(bundle.sources));

    // 3. knowledge map (reuse when regenerating)
    let knowledgeMapId = input.reuseKnowledgeMapId;
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
    const plan = await runStage(jobId, "song_plan", () => buildSongPlan(km, input));

    // 5. lyric draft (or user-edited lyrics)
    let draft: LyricDraft = input.lyricsOverride
      ? draftFromText(input.lyricsOverride)
      : await runStage(jobId, "lyric_draft", () => draftLyrics(plan, km));

    // 6-8. critique → rewrite loop + independent fact-check gate
    const runner: StageRunner = { run: (_id, stage, fn) => runStage(jobId, stage, fn) };
    draft = await refineAndVerify(runner, { draft, km, plan, input, maxRewrites: env.maxRewrites() });

    // 9. style params
    const musicReq = await runStage(jobId, "style_params", () => buildMusicRequest(plan, draft, input));

    // 10. music (synchronous Google TTS)
    const music = await runStage(jobId, "music", () => {
      if (!provider.render) throw new Error(`Provider ${provider.id} cannot render audio`);
      return provider.render(musicReq, { jobId });
    });

    // 11. post-process: title + ensure audio is in our storage
    const meta = await runStage(jobId, "post_process", () => makeTitle(plan, draft));
    const audioKey = music.storageKey ?? `songs/${jobId}.mp3`;
    if (!music.storageKey && music.audioUrl) {
      await fetchExternalToBlob(music.audioUrl, audioKey);
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
    await store.markFailed(jobId, (e as Error)?.message ?? String(e));
  }
}

// ---- Start guard ----------------------------------------------------------

const STALE_MS = 180_000; // re-drive a "running" job if untouched this long
const inFlight = new Set<string>();

/**
 * Idempotently start a job's pipeline. Driven by the SSE stream endpoint, which
 * keeps the serverless function alive while the pipeline runs. A Firestore
 * transaction (plus an in-memory guard) ensures only one runner executes.
 */
export async function startIfNeeded(jobId: string): Promise<"started" | "running" | "done" | "missing"> {
  if (inFlight.has(jobId)) return "running";

  const ref = getDb().collection(COLLECTIONS.jobs).doc(jobId);
  // Holder object so the value set inside the async transaction is observed
  // afterwards (TS control-flow can't narrow a plain `let` mutated in a closure).
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
      state.d = "start"; // previous runner appears to have died
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
