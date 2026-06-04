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
  StageStates,
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
  const ref = jobs().doc(jobId);
  const snap = await ref.get();
  const states = { ...((snap.data()?.stageStates ?? {}) as StageStates) };
  const prev = states[stage] ?? { status: "pending" as const };
  states[stage] = {
    ...prev,
    ...patch,
    attempts: (prev.attempts ?? 0) + (patch.status === "running" ? 1 : 0),
  };
  await ref.update({ stageStates: states, currentStage: stage, updatedAt: Date.now() });
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
  const songRef = await songsCol().add({
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
    createdAt: now,
    updatedAt: now,
  });

  await jobs().doc(jobId).update({
    status: "succeeded",
    songId: songRef.id,
    currentStage: "finalize",
    updatedAt: Date.now(),
  });

  await incrementSongCount(bundle.job.userId);
  return songRef.id;
}

export async function markFailed(jobId: string, error: string): Promise<void> {
  await jobs()
    .doc(jobId)
    .update({ status: "failed", error: error.slice(0, 2000), updatedAt: Date.now() })
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

export async function incrementSongCount(userId: string): Promise<void> {
  const windowDate = todayUtc();
  await usage()
    .doc(`${userId}_${windowDate}`)
    .set(
      { userId, windowDate, songsGenerated: FieldValue.increment(1) },
      { merge: true },
    );
}
