/** App-level types shared across the pipeline, DB, and UI. */

export type {
  Fact,
  KnowledgeMap,
  SongPlan,
  SongSection,
  LyricLine,
  LyricDraft,
  Critique,
  Grounding,
  MusicRequest,
  VoiceHint,
  SongMeta,
} from "@/agents/schemas";

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export const STAGE_NAMES = [
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
] as const;
export type StageName = (typeof STAGE_NAMES)[number];

export interface StageState {
  status: "pending" | "running" | "done" | "error" | "skipped";
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  attempts?: number;
  note?: string;
}
export type StageStates = Partial<Record<StageName, StageState>>;

export interface JobInputParams {
  focusPrompt?: string;
  genre?: string;
  voiceGender?: "female" | "male" | "neutral";
  voiceStyle?: "sung" | "rap" | "spoken";
  provider?: string;
  targetDurationSec?: number;
  /** Set when editing: user-supplied lyrics re-enter the pipeline at style/music. */
  lyricsOverride?: string;
  /** Set when regenerating: reuse an existing knowledge map instead of re-extracting. */
  reuseKnowledgeMapId?: string;
  /** Seed strategy for "regenerate with variation". */
  seed?: number;
  /** Version lineage when regenerating/editing from an existing song. */
  parentSongId?: string;
}

import type { VoiceHint } from "@/agents/schemas";

export interface SongParams {
  genre?: string;
  styleTags?: string;
  voice?: VoiceHint;
  seed?: number;
  durationSec?: number;
  providerId?: string;
}

export interface NormalizedSource {
  sourceId: string;
  filename: string;
  text: string;
  tokenEstimate: number;
  warnings: string[];
}

/** Friendly, ordered labels for the progress UI. */
export const STAGE_LABELS: Record<StageName, string> = {
  ingest: "Reading your files",
  extract: "Extracting text",
  knowledge_map: "Finding the key facts",
  song_plan: "Designing the song",
  lyric_draft: "Writing the lyrics",
  critique: "Critiquing the draft",
  rewrite: "Rewriting for accuracy & catchiness",
  fact_check: "Fact-checking every line",
  style_params: "Choosing the sound",
  music: "Singing it (generating audio)",
  post_process: "Mixing & titling",
  finalize: "Finishing up",
};
