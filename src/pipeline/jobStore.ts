import { FieldValue } from "firebase-admin/firestore";
import { COLLECTIONS, getDb } from "@/db";
import type { DbGenerationJob, DbSourceDocument } from "@/db/types";
import type {
  KnowledgeMap,
  LyricDraft,
  MusicRequest,
  PipelineCheckpoint,
  SongMeta,
  SongPlan,
  StageName,
  StageState,
} from "@/shared/types";

export interface JobBundle {
  job: DbGenerationJob;
  sources: DbSourceDocument[];
}

const jobs = () => getDb().collection(COLLECTIONS.jobs);
const sources = () => getDb().collection(COLLECTIONS.sources);
const kms = () => getDb().collection(COLLECTIONS.knowledgeMaps);
const songsCol = () => getDb().collection(COLLECTIONS.songs);
const usage = () => getDb().collection(COLLECTIONS.usage);

export async function loadJobBundle(jobId: string): Promise<JobBundle> {
  const snap = await jobs().doc(jobId).get();
  if (!snap.exists) throw new Error(`Job not found: ${jobId}`);
  const job = { id: snap.id, ...snap.data() } as DbGenerationJob;
  const srcSnap = await sources().where("projectId", "==", job.projectId).get();
  const list = srcSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as DbSourceDocument);
  return { job, sources: list };
}

export async function markRunning(jobId: string): Promise<void> {
  await jobs().doc(jobId).update({ status: "running", updatedAt: Date.now() });
}

export async function setStage(
  jobId: string,
  stage: StageName,
  patch: Partial<StageState>,
): Promise<void> {
  // Targeted field-path update of just this one stage (no read-modify-write of
  // the whole map): safe when a stale-job re-drive briefly runs two pipeline
  // instances, since concurrent writers touch different stage subkeys. Attempts
  // are bumped atomically only when the stage (re)enters "running".
  const update: Record<string, unknown> = {
    currentStage: stage,
    updatedAt: Date.now(),
  };
  for (const [k, v] of Object.entries(patch)) {
    update[`stageStates.${stage}.${k}`] = v;
  }
  if (patch.status === "running") {
    update[`stageStates.${stage}.attempts`] = FieldValue.increment(1);
  }
  await jobs().doc(jobId).update(update);
}

export async function setKnowledgeMapId(jobId: string, kmId: string): Promise<void> {
  await jobs().doc(jobId).update({ knowledgeMapId: kmId, updatedAt: Date.now() });
}

export async function saveCheckpoint(
  jobId: string,
  checkpoint: PipelineCheckpoint,
): Promise<void> {
  await jobs().doc(jobId).update({ checkpoint, updatedAt: Date.now() });
}

export async function saveSourceText(
  sourceId: string,
  text: string,
  tokenEstimate: number,
  warnings: string[],
  ok: boolean,
): Promise<void> {
  await sources().doc(sourceId).update({
    normalizedText: text,
    tokenEstimate,
    warnings,
    status: ok ? "extracted" : "failed",
  });
}

export async function saveKnowledgeMap(
  projectId: string,
  km: KnowledgeMap,
  sourceHash: string,
): Promise<string> {
  const ref = await kms().add({
    projectId,
    sourceHash,
    facts: km.facts,
    themes: km.themes ?? [],
    focusApplied: km.focusApplied ?? null,
    createdAt: Date.now(),
  });
  return ref.id;
}

export async function getKnowledgeMapById(id: string): Promise<KnowledgeMap> {
  const snap = await kms().doc(id).get();
  if (!snap.exists) throw new Error(`Knowledge map not found: ${id}`);
  const d = snap.data()!;
  return { facts: d.facts ?? [], themes: d.themes ?? [], focusApplied: d.focusApplied ?? undefined };
}

export async function createSongAndFinish(args: {
  jobId: string;
  bundle: JobBundle;
  knowledgeMapId?: string;
  plan: SongPlan;
  draft: LyricDraft;
  musicReq: MusicRequest;
  meta: SongMeta;
  audioKey: string;
  providerId: string;
}): Promise<string> {
  const { jobId, bundle, plan, draft, musicReq, meta, audioKey, providerId } = args;
  const input = bundle.job.inputParams;

  let version = 1;
  let rootSongId: string | null = null;
  let parentSongId: string | null = null;
  if (input.parentSongId) {
    const parentSnap = await songsCol().doc(input.parentSongId).get();
    if (parentSnap.exists) {
      const parent = parentSnap.data()!;
      parentSongId = parentSnap.id;
      rootSongId = parent.rootSongId ?? parentSnap.id;
      version = (parent.version ?? 1) + 1;
    }
  }

  const now = Date.now();
  const jobRef = jobs().doc(jobId);
  const songRef = songsCol().doc();
  const songData = {
    projectId: bundle.job.projectId,
    userId: bundle.job.userId,
    jobId,
    title: meta.title,
    description: meta.description,
    lyrics: draft.taggedLyrics,
    lineFactMap: draft.lines,
    knowledgeMapId: args.knowledgeMapId ?? null,
    params: {
      genre: musicReq.genre ?? plan.genre,
      styleTags: musicReq.styleTags,
      voice: musicReq.voice ?? null,
      seed: musicReq.seed ?? null,
      durationSec: musicReq.durationSec,
      providerId,
    },
    providerId,
    audioStorageKey: audioKey,
    audioDurationSec: plan.targetDurationSec,
    parentSongId,
    rootSongId,
    version,
    isPublic: false,
    visibility: "private" as const,
    createdAt: now,
    updatedAt: now,
  };

  // Idempotent finalize: if a stale re-drive briefly ran a second copy of this
  // job, the first to commit sets `songId`; the loser's transaction re-reads it
  // and returns that id without creating a second song (so one job → one song).
  return getDb().runTransaction(async (t) => {
    const jobSnap = await t.get(jobRef);
    const existing = jobSnap.data()?.songId as string | undefined;
    if (existing) return existing;
    t.set(songRef, songData);
    t.update(jobRef, {
      status: "succeeded",
      songId: songRef.id,
      currentStage: "finalize",
      updatedAt: Date.now(),
    });
    return songRef.id;
  });
}

export async function markFailed(jobId: string, error: string): Promise<void> {
  const ref = jobs().doc(jobId);
  // Never clobber a job that already succeeded — a stale re-drive's second copy
  // could fail late, after the first copy finished, and must not flip it to failed.
  await getDb()
    .runTransaction(async (t) => {
      const snap = await t.get(ref);
      if (!snap.exists || snap.data()?.status === "succeeded") return;
      t.update(ref, { status: "failed", error: error.slice(0, 2000), updatedAt: Date.now() });
    })
    .catch(() => {});
}

// ---- Quota helpers --------------------------------------------------------

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function songsToday(userId: string): Promise<number> {
  const snap = await usage().doc(`${userId}_${todayUtc()}`).get();
  return (snap.data()?.songsGenerated as number) ?? 0;
}

/**
 * Atomically reserve one slot against the daily cap, at enqueue time. Reserving
 * here (instead of incrementing at finalize) closes the TOCTOU where several
 * rapid submissions each read a stale count of 0 and all slip past the cap: the
 * transaction serializes concurrent reservations on the per-day usage doc.
 * Throws when the cap is already reached. A reservation is intentionally kept
 * even if the job later fails (abuse protection); the daily window resets in UTC.
 */
export async function reserveDailyQuota(userId: string, cap: number): Promise<void> {
  const windowDate = todayUtc();
  const ref = usage().doc(`${userId}_${windowDate}`);
  await getDb().runTransaction(async (t) => {
    const used = (await t.get(ref)).data()?.songsGenerated ?? 0;
    if (used >= cap) {
      throw new Error(`Daily limit reached (${cap} songs). Try again tomorrow.`);
    }
    t.set(ref, { userId, windowDate, songsGenerated: used + 1 }, { merge: true });
  });
}
