import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  generationJobs,
  knowledgeMaps,
  songs,
  sourceDocuments,
  usageCounters,
  type DbGenerationJob,
  type DbSourceDocument,
} from "@/db/schema";
import type {
  KnowledgeMap,
  LyricDraft,
  SongPlan,
  StageName,
  StageState,
  MusicRequest,
  SongMeta,
} from "@/shared/types";

export interface JobBundle {
  job: DbGenerationJob;
  sources: DbSourceDocument[];
}

export async function loadJobBundle(jobId: string): Promise<JobBundle> {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId));
  if (!job) throw new Error(`Job not found: ${jobId}`);
  const sources = await db
    .select()
    .from(sourceDocuments)
    .where(eq(sourceDocuments.projectId, job.projectId));
  return { job, sources };
}

export async function markRunning(jobId: string, inngestRunId?: string): Promise<void> {
  await db
    .update(generationJobs)
    .set({ status: "running", inngestRunId, updatedAt: new Date() })
    .where(eq(generationJobs.id, jobId));
}

export async function setStage(
  jobId: string,
  stage: StageName,
  patch: Partial<StageState>,
): Promise<void> {
  const [job] = await db
    .select({ stageStates: generationJobs.stageStates })
    .from(generationJobs)
    .where(eq(generationJobs.id, jobId));
  const states = { ...(job?.stageStates ?? {}) };
  const prev = states[stage] ?? { status: "pending" as const };
  states[stage] = { ...prev, ...patch, attempts: (prev.attempts ?? 0) + (patch.status === "running" ? 1 : 0) };
  await db
    .update(generationJobs)
    .set({ stageStates: states, currentStage: stage, updatedAt: new Date() })
    .where(eq(generationJobs.id, jobId));
}

export async function setMusicJob(
  jobId: string,
  providerId: string,
  musicJobId: string,
): Promise<void> {
  await db
    .update(generationJobs)
    .set({ musicProviderId: providerId, musicJobId, status: "waiting_music", updatedAt: new Date() })
    .where(eq(generationJobs.id, jobId));
}

export async function setKnowledgeMapId(jobId: string, kmId: string): Promise<void> {
  await db
    .update(generationJobs)
    .set({ knowledgeMapId: kmId, updatedAt: new Date() })
    .where(eq(generationJobs.id, jobId));
}

export async function saveSourceText(
  sourceId: string,
  text: string,
  tokenEstimate: number,
  warnings: string[],
  ok: boolean,
): Promise<void> {
  await db
    .update(sourceDocuments)
    .set({
      normalizedText: text,
      tokenEstimate,
      warnings,
      status: ok ? "extracted" : "failed",
    })
    .where(eq(sourceDocuments.id, sourceId));
}

export async function saveKnowledgeMap(
  projectId: string,
  km: KnowledgeMap,
  sourceHash: string,
): Promise<string> {
  const [row] = await db
    .insert(knowledgeMaps)
    .values({
      projectId,
      sourceHash,
      facts: km.facts,
      themes: km.themes ?? [],
      focusApplied: km.focusApplied,
    })
    .returning({ id: knowledgeMaps.id });
  return row.id;
}

export async function getKnowledgeMapById(id: string): Promise<KnowledgeMap> {
  const [row] = await db.select().from(knowledgeMaps).where(eq(knowledgeMaps.id, id));
  if (!row) throw new Error(`Knowledge map not found: ${id}`);
  return { facts: row.facts, themes: row.themes ?? [], focusApplied: row.focusApplied ?? undefined };
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

  // Version lineage for regenerate/edit.
  let version = 1;
  let rootSongId: string | undefined;
  let parentSongId: string | undefined;
  if (input.parentSongId) {
    const [parent] = await db.select().from(songs).where(eq(songs.id, input.parentSongId));
    if (parent) {
      parentSongId = parent.id;
      rootSongId = parent.rootSongId ?? parent.id;
      version = (parent.version ?? 1) + 1;
    }
  }

  const [song] = await db
    .insert(songs)
    .values({
      projectId: bundle.job.projectId,
      userId: bundle.job.userId,
      jobId,
      title: meta.title,
      description: meta.description,
      lyrics: draft.taggedLyrics,
      lineFactMap: draft.lines,
      knowledgeMapId: args.knowledgeMapId,
      params: {
        genre: musicReq.genre ?? plan.genre,
        styleTags: musicReq.styleTags,
        voice: musicReq.voice,
        seed: musicReq.seed,
        durationSec: musicReq.durationSec,
        providerId,
      },
      providerId,
      audioR2Key: audioKey,
      audioDurationSec: plan.targetDurationSec,
      parentSongId,
      rootSongId,
      version,
    })
    .returning({ id: songs.id });

  await db
    .update(generationJobs)
    .set({ status: "succeeded", songId: song.id, currentStage: "finalize", updatedAt: new Date() })
    .where(eq(generationJobs.id, jobId));

  await incrementSongCount(bundle.job.userId);
  return song.id;
}

export async function markFailed(jobId: string, error: string): Promise<void> {
  await db
    .update(generationJobs)
    .set({ status: "failed", error: error.slice(0, 2000), updatedAt: new Date() })
    .where(eq(generationJobs.id, jobId));
}

// ---- Quota helpers --------------------------------------------------------

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function songsToday(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: usageCounters.songsGenerated })
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.windowDate, todayUtc())));
  return row?.n ?? 0;
}

export async function incrementSongCount(userId: string): Promise<void> {
  const windowDate = todayUtc();
  await db
    .insert(usageCounters)
    .values({ userId, windowDate, songsGenerated: 1 })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.windowDate],
      set: { songsGenerated: sqlInc() },
    });
}

// Expresses `songs_generated + 1` for the upsert.
function sqlInc() {
  return sql`${usageCounters.songsGenerated} + 1`;
}

export async function recentJobsForUser(userId: string, limit = 20) {
  return db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.userId, userId))
    .orderBy(desc(generationJobs.createdAt))
    .limit(limit);
}
