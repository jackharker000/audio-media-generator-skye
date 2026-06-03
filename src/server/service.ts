import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  generationJobs,
  projects,
  shares,
  songs,
  sourceDocuments,
  type DbGenerationJob,
  type DbProject,
  type DbSong,
  type DbSourceDocument,
} from "@/db/schema";
import { inngest } from "@/inngest/client";
import { putObject } from "@/storage";
import { env } from "@/lib/env";
import { songsToday } from "@/pipeline/jobStore";
import { slugify } from "@/lib/utils";
import type { JobInputParams } from "@/shared/types";

// ---- Projects -------------------------------------------------------------

export async function createProject(
  userId: string,
  data: { title: string; description?: string; focusPromptDefault?: string },
): Promise<DbProject> {
  const [row] = await db
    .insert(projects)
    .values({
      userId,
      title: data.title.trim() || "Untitled notebook",
      description: data.description,
      focusPromptDefault: data.focusPromptDefault,
    })
    .returning();
  return row;
}

export function listProjects(userId: string): Promise<DbProject[]> {
  return db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt));
}

async function assertProjectOwner(userId: string, projectId: string): Promise<DbProject> {
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!p || p.userId !== userId) throw new Error("Project not found");
  return p;
}

export async function getProjectDetail(userId: string, projectId: string) {
  const project = await assertProjectOwner(userId, projectId);
  const [sources, projectSongs, jobs] = await Promise.all([
    db.select().from(sourceDocuments).where(eq(sourceDocuments.projectId, projectId)),
    db
      .select()
      .from(songs)
      .where(eq(songs.projectId, projectId))
      .orderBy(desc(songs.createdAt)),
    db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.projectId, projectId))
      .orderBy(desc(generationJobs.createdAt))
      .limit(10),
  ]);
  return { project, sources, songs: projectSongs, jobs };
}

export async function deleteProject(userId: string, projectId: string): Promise<void> {
  await assertProjectOwner(userId, projectId);
  await db.delete(projects).where(eq(projects.id, projectId));
}

// ---- Sources --------------------------------------------------------------

export async function addPasteSource(
  userId: string,
  projectId: string,
  data: { title?: string; text: string },
): Promise<DbSourceDocument> {
  await assertProjectOwner(userId, projectId);
  const [row] = await db
    .insert(sourceDocuments)
    .values({
      projectId,
      userId,
      kind: "paste",
      filename: data.title?.trim() || "Pasted notes",
      mime: "text/plain",
      status: "extracted",
      normalizedText: data.text,
      tokenEstimate: Math.ceil(data.text.length / 4),
    })
    .returning();
  return row;
}

export async function addUploadSource(
  userId: string,
  projectId: string,
  file: { filename: string; mime?: string; buffer: Buffer },
): Promise<DbSourceDocument> {
  await assertProjectOwner(userId, projectId);
  const key = `sources/${projectId}/${crypto.randomUUID()}-${slugify(file.filename) || "file"}`;
  await putObject(key, file.buffer, file.mime);
  const [row] = await db
    .insert(sourceDocuments)
    .values({
      projectId,
      userId,
      kind: "upload",
      filename: file.filename,
      mime: file.mime,
      r2Key: key,
      bytes: file.buffer.length,
      status: "stored",
    })
    .returning();
  return row;
}

export async function deleteSource(userId: string, sourceId: string): Promise<void> {
  const [s] = await db.select().from(sourceDocuments).where(eq(sourceDocuments.id, sourceId));
  if (!s || s.userId !== userId) throw new Error("Source not found");
  await db.delete(sourceDocuments).where(eq(sourceDocuments.id, sourceId));
}

// ---- Generation -----------------------------------------------------------

export async function startGeneration(
  userId: string,
  projectId: string,
  input: JobInputParams,
): Promise<string> {
  await assertProjectOwner(userId, projectId);

  const used = await songsToday(userId);
  if (used >= env.quotaSongsPerDay()) {
    throw new Error(`Daily limit reached (${env.quotaSongsPerDay()} songs). Try again tomorrow.`);
  }

  const srcCount = await db
    .select({ id: sourceDocuments.id })
    .from(sourceDocuments)
    .where(eq(sourceDocuments.projectId, projectId));
  if (srcCount.length === 0) {
    throw new Error("Add at least one source (file or pasted text) before generating.");
  }

  const [job] = await db
    .insert(generationJobs)
    .values({ projectId, userId, status: "queued", inputParams: input })
    .returning({ id: generationJobs.id });

  await inngest.send({ name: "song/generate.requested", data: { jobId: job.id } });
  return job.id;
}

export async function getJob(userId: string, jobId: string): Promise<DbGenerationJob | null> {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId));
  if (!job || job.userId !== userId) return null;
  return job;
}

// ---- Songs ----------------------------------------------------------------

export function listSongs(userId: string): Promise<DbSong[]> {
  return db
    .select()
    .from(songs)
    .where(eq(songs.userId, userId))
    .orderBy(desc(songs.createdAt));
}

export async function getSong(userId: string, songId: string): Promise<DbSong | null> {
  const [song] = await db.select().from(songs).where(eq(songs.id, songId));
  if (!song || song.userId !== userId) return null;
  return song;
}

export async function regenerateSong(
  userId: string,
  songId: string,
  overrides: Partial<JobInputParams> = {},
): Promise<string> {
  const song = await getSong(userId, songId);
  if (!song) throw new Error("Song not found");
  const input: JobInputParams = {
    genre: overrides.genre ?? song.params.genre,
    voiceGender: overrides.voiceGender ?? song.params.voice?.gender,
    voiceStyle: overrides.voiceStyle ?? song.params.voice?.style,
    provider: overrides.provider ?? song.providerId ?? undefined,
    reuseKnowledgeMapId: song.knowledgeMapId ?? undefined,
    parentSongId: song.id,
    seed: overrides.seed ?? Math.floor(Math.random() * 1_000_000),
    focusPrompt: overrides.focusPrompt,
  };
  return startGeneration(userId, song.projectId, input);
}

export async function editSong(
  userId: string,
  songId: string,
  data: { lyrics: string; genre?: string; voiceGender?: JobInputParams["voiceGender"] },
): Promise<string> {
  const song = await getSong(userId, songId);
  if (!song) throw new Error("Song not found");
  const input: JobInputParams = {
    lyricsOverride: data.lyrics,
    genre: data.genre ?? song.params.genre,
    voiceGender: data.voiceGender ?? song.params.voice?.gender,
    reuseKnowledgeMapId: song.knowledgeMapId ?? undefined,
    parentSongId: song.id,
    provider: song.providerId ?? undefined,
  };
  return startGeneration(userId, song.projectId, input);
}

// ---- Sharing --------------------------------------------------------------

export async function createShare(
  userId: string,
  songId: string,
  visibility: "unlisted" | "public",
): Promise<string> {
  const song = await getSong(userId, songId);
  if (!song) throw new Error("Song not found");

  const [existing] = await db.select().from(shares).where(eq(shares.songId, songId));
  if (existing) {
    await db.update(shares).set({ visibility }).where(eq(shares.id, existing.id));
    if (visibility === "public") {
      await db.update(songs).set({ isPublic: true }).where(eq(songs.id, songId));
    }
    return existing.slug;
  }

  const slug = `${slugify(song.title)}-${crypto.randomUUID().slice(0, 6)}`;
  await db.insert(shares).values({ songId, ownerId: userId, slug, visibility });
  if (visibility === "public") {
    await db.update(songs).set({ isPublic: true }).where(eq(songs.id, songId));
  }
  return slug;
}

export async function deleteShare(userId: string, songId: string): Promise<void> {
  const song = await getSong(userId, songId);
  if (!song) throw new Error("Song not found");
  await db.delete(shares).where(eq(shares.songId, songId));
  await db.update(songs).set({ isPublic: false }).where(eq(songs.id, songId));
}

export async function getShareBySlug(slug: string): Promise<{ share: typeof shares.$inferSelect; song: DbSong } | null> {
  const [share] = await db.select().from(shares).where(eq(shares.slug, slug));
  if (!share) return null;
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) return null;
  const [song] = await db.select().from(songs).where(eq(songs.id, share.songId));
  if (!song) return null;
  return { share, song };
}
