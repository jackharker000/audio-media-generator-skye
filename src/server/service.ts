import { COLLECTIONS, getDb } from "@/db";
import { byNewest, col, withId } from "@/db/helpers";
import type {
  DbGenerationJob,
  DbProject,
  DbShare,
  DbSong,
  DbSourceDocument,
} from "@/db/types";
import { deleteObject, putObject } from "@/storage";
import { env } from "@/lib/env";
import { songsToday } from "@/pipeline/jobStore";
import { slugify } from "@/lib/utils";
import { generateQuiz } from "@/agents/quiz";
import { getUserLimits } from "@/server/admin";
import type { Fact, QuizQuestion } from "@/agents/schemas";
import type { JobInputParams } from "@/shared/types";

// ---- Projects -------------------------------------------------------------

export async function createProject(
  userId: string,
  data: { title: string; description?: string; focusPromptDefault?: string },
): Promise<DbProject> {
  const doc = {
    userId,
    title: data.title.trim() || "Untitled notebook",
    description: data.description ?? null,
    focusPromptDefault: data.focusPromptDefault ?? null,
    createdAt: Date.now(),
  };
  const ref = await col(COLLECTIONS.projects).add(doc);
  return { id: ref.id, ...doc };
}

export async function listProjects(userId: string): Promise<DbProject[]> {
  const snap = await col(COLLECTIONS.projects).where("userId", "==", userId).get();
  return snap.docs.map((d) => withId<DbProject>(d)).sort(byNewest);
}

async function assertProjectOwner(userId: string, projectId: string): Promise<DbProject> {
  const snap = await col(COLLECTIONS.projects).doc(projectId).get();
  const p = snap.exists ? withId<DbProject>(snap) : null;
  if (!p || p.userId !== userId) throw new Error("Project not found");
  return p;
}

export async function getProjectDetail(userId: string, projectId: string) {
  const project = await assertProjectOwner(userId, projectId);
  const [srcSnap, songSnap, jobSnap] = await Promise.all([
    col(COLLECTIONS.sources).where("projectId", "==", projectId).get(),
    col(COLLECTIONS.songs).where("projectId", "==", projectId).get(),
    col(COLLECTIONS.jobs).where("projectId", "==", projectId).get(),
  ]);
  return {
    project,
    sources: srcSnap.docs.map((d) => withId<DbSourceDocument>(d)).sort(byNewest),
    songs: songSnap.docs.map((d) => withId<DbSong>(d)).sort(byNewest),
    jobs: jobSnap.docs.map((d) => withId<DbGenerationJob>(d)).sort(byNewest).slice(0, 10),
  };
}

export async function deleteProject(userId: string, projectId: string): Promise<void> {
  await assertProjectOwner(userId, projectId);
  await col(COLLECTIONS.projects).doc(projectId).delete();
}

// ---- Sources --------------------------------------------------------------

export async function addPasteSource(
  userId: string,
  projectId: string,
  data: { title?: string; text: string },
): Promise<DbSourceDocument> {
  await assertProjectOwner(userId, projectId);
  const doc = {
    projectId,
    userId,
    kind: "paste" as const,
    filename: data.title?.trim() || "Pasted notes",
    mime: "text/plain",
    status: "extracted" as const,
    normalizedText: data.text,
    tokenEstimate: Math.ceil(data.text.length / 4),
    warnings: [] as string[],
    createdAt: Date.now(),
  };
  const ref = await col(COLLECTIONS.sources).add(doc);
  return { id: ref.id, ...doc };
}

export async function addUploadSource(
  userId: string,
  projectId: string,
  file: { filename: string; mime?: string; buffer: Buffer },
): Promise<DbSourceDocument> {
  await assertProjectOwner(userId, projectId);
  const key = `sources/${projectId}/${crypto.randomUUID()}-${slugify(file.filename) || "file"}`;
  await putObject(key, file.buffer, file.mime);
  const doc = {
    projectId,
    userId,
    kind: "upload" as const,
    filename: file.filename,
    mime: file.mime ?? null,
    storageKey: key,
    bytes: file.buffer.length,
    status: "stored" as const,
    createdAt: Date.now(),
  };
  const ref = await col(COLLECTIONS.sources).add(doc);
  return { id: ref.id, ...doc };
}

export async function deleteSource(userId: string, sourceId: string): Promise<void> {
  const snap = await col(COLLECTIONS.sources).doc(sourceId).get();
  const s = snap.exists ? withId<DbSourceDocument>(snap) : null;
  if (!s || s.userId !== userId) throw new Error("Source not found");
  await col(COLLECTIONS.sources).doc(sourceId).delete();
}

// ---- Generation -----------------------------------------------------------

export async function startGeneration(
  userId: string,
  projectId: string,
  input: JobInputParams,
): Promise<string> {
  await assertProjectOwner(userId, projectId);

  // Per-user admin controls: disable account, or override the daily cap.
  const limits = await getUserLimits(userId);
  if (limits.disabled) {
    throw new Error("Your account is disabled. Please contact an administrator.");
  }
  const dailyCap = limits.quotaOverride ?? env.quotaSongsPerDay();
  if ((await songsToday(userId)) >= dailyCap) {
    throw new Error(`Daily limit reached (${dailyCap} songs). Try again tomorrow.`);
  }

  const srcSnap = await col(COLLECTIONS.sources).where("projectId", "==", projectId).limit(1).get();
  if (srcSnap.empty) {
    throw new Error("Add at least one source (file or pasted text) before generating.");
  }

  const now = Date.now();
  const ref = await col(COLLECTIONS.jobs).add({
    projectId,
    userId,
    status: "queued",
    stageStates: {},
    inputParams: input,
    createdAt: now,
    updatedAt: now,
  });
  // The pipeline is driven by the SSE stream endpoint (keeps the function alive).
  return ref.id;
}

export async function getJob(userId: string, jobId: string): Promise<DbGenerationJob | null> {
  const snap = await col(COLLECTIONS.jobs).doc(jobId).get();
  const job = snap.exists ? withId<DbGenerationJob>(snap) : null;
  if (!job || job.userId !== userId) return null;
  return job;
}

// ---- Songs ----------------------------------------------------------------

export async function listSongs(userId: string): Promise<DbSong[]> {
  const snap = await col(COLLECTIONS.songs).where("userId", "==", userId).get();
  return snap.docs.map((d) => withId<DbSong>(d)).sort(byNewest);
}

export async function getSong(userId: string, songId: string): Promise<DbSong | null> {
  const snap = await col(COLLECTIONS.songs).doc(songId).get();
  const song = snap.exists ? withId<DbSong>(snap) : null;
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

  const existingSnap = await col(COLLECTIONS.shares).where("songId", "==", songId).limit(1).get();
  if (!existingSnap.empty) {
    const existing = withId<DbShare>(existingSnap.docs[0]);
    await col(COLLECTIONS.shares).doc(existing.id).update({ visibility });
    if (visibility === "public") {
      await col(COLLECTIONS.songs).doc(songId).update({ isPublic: true });
    }
    return existing.slug;
  }

  const slug = `${slugify(song.title)}-${crypto.randomUUID().slice(0, 6)}`;
  await col(COLLECTIONS.shares).add({
    songId,
    ownerId: userId,
    slug,
    visibility,
    allowDownload: true,
    expiresAt: null,
    createdAt: Date.now(),
  });
  if (visibility === "public") {
    await col(COLLECTIONS.songs).doc(songId).update({ isPublic: true });
  }
  return slug;
}

export async function deleteShare(userId: string, songId: string): Promise<void> {
  const song = await getSong(userId, songId);
  if (!song) throw new Error("Song not found");
  const snap = await col(COLLECTIONS.shares).where("songId", "==", songId).get();
  await Promise.all(snap.docs.map((d) => col(COLLECTIONS.shares).doc(d.id).delete()));
  await col(COLLECTIONS.songs).doc(songId).update({ isPublic: false });
}

export async function getShareBySlug(
  slug: string,
): Promise<{ share: DbShare; song: DbSong } | null> {
  const snap = await col(COLLECTIONS.shares).where("slug", "==", slug).limit(1).get();
  if (snap.empty) return null;
  const share = withId<DbShare>(snap.docs[0]);
  if (share.expiresAt && share.expiresAt < Date.now()) return null;
  const songSnap = await col(COLLECTIONS.songs).doc(share.songId).get();
  if (!songSnap.exists) return null;
  return { share, song: withId<DbSong>(songSnap) };
}

// ---- Study features (facts, quiz, deletion) -------------------------------

async function factsForSong(song: DbSong): Promise<Fact[]> {
  if (!song.knowledgeMapId) return [];
  const snap = await col(COLLECTIONS.knowledgeMaps).doc(song.knowledgeMapId).get();
  return (snap.data()?.facts as Fact[]) ?? [];
}

export async function getSongView(userId: string, songId: string) {
  const song = await getSong(userId, songId);
  if (!song) return null;
  return { song, facts: await factsForSong(song), lines: song.lineFactMap ?? [] };
}

export async function getOrCreateQuiz(userId: string, songId: string): Promise<QuizQuestion[]> {
  const song = await getSong(userId, songId);
  if (!song) throw new Error("Song not found");
  if (song.quiz && song.quiz.length) return song.quiz;
  const facts = await factsForSong(song);
  if (!facts.length) throw new Error("No source facts available to build a quiz.");
  const count = Math.min(8, Math.max(4, Math.ceil(facts.length / 2)));
  const quiz = await generateQuiz(facts, count);
  await col(COLLECTIONS.songs).doc(songId).update({ quiz: quiz.questions, updatedAt: Date.now() });
  return quiz.questions;
}

export async function deleteSong(userId: string, songId: string): Promise<void> {
  const song = await getSong(userId, songId);
  if (!song) throw new Error("Song not found");
  if (song.audioStorageKey) await deleteObject(song.audioStorageKey);
  const shares = await col(COLLECTIONS.shares).where("songId", "==", songId).get();
  await Promise.all(shares.docs.map((d) => col(COLLECTIONS.shares).doc(d.id).delete()));
  await col(COLLECTIONS.songs).doc(songId).delete();
}

// ---- Account settings & self-serve data deletion --------------------------

export interface MySettings {
  email: string | null;
  displayName: string | null;
  defaultGenre: string | null;
  defaultVoiceGender: "female" | "male" | "neutral" | null;
}

export async function getMySettings(userId: string): Promise<MySettings> {
  const snap = await col("users").doc(userId).get();
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  return {
    email: (d.email as string) ?? null,
    displayName: (d.displayName as string) ?? null,
    defaultGenre: (d.defaultGenre as string) ?? null,
    defaultVoiceGender: (d.defaultVoiceGender as MySettings["defaultVoiceGender"]) ?? null,
  };
}

export async function updateMySettings(
  userId: string,
  patch: { displayName?: string; defaultGenre?: string; defaultVoiceGender?: string },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.displayName !== undefined) {
    update.displayName = String(patch.displayName).trim().slice(0, 80) || null;
  }
  if (patch.defaultGenre !== undefined) {
    update.defaultGenre = String(patch.defaultGenre).trim().slice(0, 40) || null;
  }
  if (patch.defaultVoiceGender !== undefined) {
    update.defaultVoiceGender = ["female", "male", "neutral"].includes(patch.defaultVoiceGender)
      ? patch.defaultVoiceGender
      : null;
  }
  if (Object.keys(update).length) await col("users").doc(userId).update(update);
}

/** Self-serve: delete all of the caller's own content (not the account doc). */
export async function deleteMyContent(userId: string): Promise<void> {
  const names = [COLLECTIONS.songs, COLLECTIONS.projects, COLLECTIONS.jobs, COLLECTIONS.sources];
  const snaps = await Promise.all(names.map((n) => col(n).where("userId", "==", userId).get()));
  const refs = snaps.flatMap((s) => s.docs.map((d) => d.ref));
  for (let i = 0; i < refs.length; i += 400) {
    const batch = getDb().batch();
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}
