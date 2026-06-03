import {
  pgTable,
  pgEnum,
  text,
  integer,
  real,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { Fact, LyricLine } from "@/agents/schemas";
import type { StageStates, JobInputParams, SongParams } from "@/shared/types";

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { mode: "date" }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { mode: "date" }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Auth.js (NextAuth) tables — shape required by @auth/drizzle-adapter
// ---------------------------------------------------------------------------

export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  createdAt: createdAt(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "waiting_music",
  "succeeded",
  "failed",
]);
export const stageEnum = pgEnum("stage", [
  "ingest",
  "extract",
  "knowledge_map",
  "song_plan",
  "lyric_draft",
  "critique",
  "rewrite",
  "fact_check",
  "style_params",
  "music",
  "post_process",
  "finalize",
]);
export const sourceKindEnum = pgEnum("source_kind", ["upload", "paste"]);
export const sourceStatusEnum = pgEnum("source_status", ["stored", "extracted", "failed"]);
export const shareVisibilityEnum = pgEnum("share_visibility", ["unlisted", "public"]);

// ---------------------------------------------------------------------------
// Application tables
// ---------------------------------------------------------------------------

export const projects = pgTable(
  "project",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    focusPromptDefault: text("focus_prompt_default"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("project_user_idx").on(t.userId, t.createdAt)],
);

export const sourceDocuments = pgTable(
  "source_document",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    kind: sourceKindEnum("kind").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime"),
    r2Key: text("r2_key"),
    bytes: integer("bytes"),
    status: sourceStatusEnum("status").notNull().default("stored"),
    normalizedText: text("normalized_text"),
    tokenEstimate: integer("token_estimate"),
    warnings: jsonb("warnings").$type<string[]>().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("source_project_idx").on(t.projectId)],
);

export const knowledgeMaps = pgTable(
  "knowledge_map",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceHash: text("source_hash").notNull(),
    facts: jsonb("facts").$type<Fact[]>().notNull(),
    themes: jsonb("themes").$type<string[]>().default([]),
    focusApplied: text("focus_applied"),
    modelMeta: jsonb("model_meta").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("km_project_hash_idx").on(t.projectId, t.sourceHash)],
);

export const generationJobs = pgTable(
  "generation_job",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    currentStage: stageEnum("current_stage"),
    stageStates: jsonb("stage_states").$type<StageStates>().notNull().default({}),
    inputParams: jsonb("input_params").$type<JobInputParams>().notNull().default({}),
    knowledgeMapId: text("knowledge_map_id"),
    inngestRunId: text("inngest_run_id"),
    musicJobId: text("music_job_id"),
    musicProviderId: text("music_provider_id"),
    songId: text("song_id"),
    error: text("error"),
    costEstimateUsd: real("cost_estimate_usd").default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("job_user_idx").on(t.userId, t.createdAt),
    index("job_status_idx").on(t.status),
  ],
);

export const songs = pgTable(
  "song",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    jobId: text("job_id"),
    title: text("title").notNull(),
    description: text("description"),
    lyrics: text("lyrics").notNull(),
    lineFactMap: jsonb("line_fact_map").$type<LyricLine[]>().default([]),
    knowledgeMapId: text("knowledge_map_id"),
    params: jsonb("params").$type<SongParams>().notNull().default({}),
    providerId: text("provider_id"),
    audioR2Key: text("audio_r2_key"),
    audioDurationSec: real("audio_duration_sec"),
    coverR2Key: text("cover_r2_key"),
    lyricsTimingR2Key: text("lyrics_timing_r2_key"),
    parentSongId: text("parent_song_id"),
    rootSongId: text("root_song_id"),
    version: integer("version").notNull().default(1),
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("song_user_idx").on(t.userId, t.createdAt),
    index("song_project_idx").on(t.projectId),
  ],
);

export const shares = pgTable(
  "share",
  {
    id: id(),
    songId: text("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    slug: text("slug").notNull(),
    visibility: shareVisibilityEnum("visibility").notNull().default("unlisted"),
    allowDownload: boolean("allow_download").notNull().default(true),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("share_slug_idx").on(t.slug)],
);

export const usageCounters = pgTable(
  "usage_counter",
  {
    id: id(),
    userId: text("user_id").notNull(),
    windowDate: text("window_date").notNull(), // YYYY-MM-DD (UTC)
    geminiRequests: integer("gemini_requests").notNull().default(0),
    geminiTokens: integer("gemini_tokens").notNull().default(0),
    songsGenerated: integer("songs_generated").notNull().default(0),
    musicSpendUsd: real("music_spend_usd").notNull().default(0),
  },
  (t) => [uniqueIndex("usage_user_window_idx").on(t.userId, t.windowDate)],
);

export type DbUser = typeof users.$inferSelect;
export type DbProject = typeof projects.$inferSelect;
export type DbSourceDocument = typeof sourceDocuments.$inferSelect;
export type DbKnowledgeMap = typeof knowledgeMaps.$inferSelect;
export type DbGenerationJob = typeof generationJobs.$inferSelect;
export type DbSong = typeof songs.$inferSelect;
export type DbShare = typeof shares.$inferSelect;
