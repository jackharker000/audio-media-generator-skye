import { z } from "zod";

/**
 * Single source of truth for the structured outputs of every Gemini stage.
 * These Zod schemas validate model output (we parse the model's JSON against
 * them) and their inferred types flow through the whole pipeline and DB.
 */

// ---- Knowledge extraction -------------------------------------------------

export const FactSchema = z.object({
  factId: z.string().describe("stable short id, e.g. f1, f2"),
  claim: z.string().describe("one atomic, self-contained fact"),
  importance: z.number().int().min(1).max(5),
  sourceRef: z.string().optional().describe("section/page hint"),
  evidence: z.string().describe("verbatim span from the source supporting the claim"),
});
export type Fact = z.infer<typeof FactSchema>;

export const ChunkFactsSchema = z.object({
  facts: z.array(FactSchema),
});

export const KnowledgeMapSchema = z.object({
  facts: z.array(FactSchema),
  themes: z.array(z.string()),
  focusApplied: z.string().optional(),
});
export type KnowledgeMap = z.infer<typeof KnowledgeMapSchema>;

// ---- Song plan ------------------------------------------------------------

export const SECTION_TYPES = [
  "intro",
  "verse",
  "pre-chorus",
  "chorus",
  "bridge",
  "outro",
] as const;

export const SongSectionSchema = z.object({
  type: z.enum(SECTION_TYPES),
  intent: z.string(),
  factIds: z.array(z.string()),
});
export type SongSection = z.infer<typeof SongSectionSchema>;

export const SongPlanSchema = z.object({
  workingTitle: z.string().optional(),
  genre: z.string(),
  mood: z.string(),
  tempoBpm: z.number().int().min(40).max(220).optional(),
  voiceHint: z.string().optional(),
  targetDurationSec: z.number().int().min(20).max(240),
  hookConcept: z.string().describe("what the repeated chorus drills in"),
  sections: z.array(SongSectionSchema).min(2),
});
export type SongPlan = z.infer<typeof SongPlanSchema>;

// ---- Lyrics ---------------------------------------------------------------

export const LyricLineSchema = z.object({
  section: z.string(),
  text: z.string(),
  factIds: z.array(z.string()),
});
export type LyricLine = z.infer<typeof LyricLineSchema>;

export const LyricDraftSchema = z.object({
  taggedLyrics: z
    .string()
    .describe("full lyrics with [verse]/[chorus]/[bridge] tags, ready for the music model"),
  lines: z.array(LyricLineSchema),
});
export type LyricDraft = z.infer<typeof LyricDraftSchema>;

// ---- Critique -------------------------------------------------------------

export const CritiqueIssueSchema = z.object({
  severity: z.enum(["low", "medium", "high"]),
  axis: z.enum(["factual", "coverage", "memorability", "singability", "style"]),
  lineRef: z.string().optional(),
  detail: z.string(),
  suggestion: z.string().optional(),
});
export type CritiqueIssue = z.infer<typeof CritiqueIssueSchema>;

export const CritiqueSchema = z.object({
  issues: z.array(CritiqueIssueSchema),
  factualErrors: z.array(z.string()).describe("lines that misstate a fact"),
  scores: z.object({
    factualFidelity: z.number().min(0).max(10),
    coverage: z.number().min(0).max(10),
    memorability: z.number().min(0).max(10),
    singability: z.number().min(0).max(10),
  }),
  pass: z.boolean(),
});
export type Critique = z.infer<typeof CritiqueSchema>;

// ---- Grounding / fact-check gate -----------------------------------------

export const LineVerdictSchema = z.object({
  text: z.string(),
  verdict: z.enum(["supported", "unsupported", "contradicted"]),
  evidence: z.string().optional(),
});
export type LineVerdict = z.infer<typeof LineVerdictSchema>;

export const GroundingSchema = z.object({
  lineVerdicts: z.array(LineVerdictSchema),
  hardFail: z.boolean(),
});
export type Grounding = z.infer<typeof GroundingSchema>;

// ---- Music request (provider-agnostic) ------------------------------------

export const VoiceHintSchema = z.object({
  gender: z.enum(["female", "male", "neutral"]).optional(),
  style: z.enum(["sung", "rap", "spoken"]).optional(),
  descriptor: z.string().optional(),
});
export type VoiceHint = z.infer<typeof VoiceHintSchema>;

// A simple, synthesizable musical arrangement (rendered by the pure-JS synth).
export const ChordSchema = z.object({
  root: z.string().describe('note letter, e.g. "C", "F#", "Bb"'),
  quality: z.string().default("maj").describe("maj | min | maj7 | min7 | dom7 | dim | sus4 | aug"),
  beats: z.number().min(0.5).max(8).default(4),
});
export type Chord = z.infer<typeof ChordSchema>;

export const ArrangementSchema = z.object({
  key: z.string().default("C major"),
  tempoBpm: z.number().min(50).max(200).default(96),
  chords: z.array(ChordSchema).min(1).max(24),
  drums: z
    .object({
      kick: z.array(z.number()).default([0, 8]),
      snare: z.array(z.number()).default([4, 12]),
      hihat: z.array(z.number()).default([0, 2, 4, 6, 8, 10, 12, 14]),
    })
    .default({}),
  feel: z.string().optional(),
});
export type Arrangement = z.infer<typeof ArrangementSchema>;

export const MusicRequestSchema = z.object({
  lyrics: z.string(),
  styleTags: z.string().describe("comma-separated genre/style/instrument/vocal tags"),
  durationSec: z.number().int().min(15).max(240),
  voice: VoiceHintSchema.optional(),
  genre: z.string().optional(),
  seed: z.number().int().optional(),
  steps: z.number().int().optional(),
  arrangement: ArrangementSchema.optional(),
});
export type MusicRequest = z.infer<typeof MusicRequestSchema>;

// ---- Misc -----------------------------------------------------------------

export const SongMetaSchema = z.object({
  title: z.string(),
  description: z.string(),
});
export type SongMeta = z.infer<typeof SongMetaSchema>;
