import { generateJson } from "@/agents/gemini";
import {
  CritiqueSchema,
  GroundingSchema,
  LyricDraftSchema,
  MusicRequestSchema,
  SongMetaSchema,
  SongPlanSchema,
  type Critique,
  type Grounding,
  type KnowledgeMap,
  type LyricDraft,
  type MusicRequest,
  type SongMeta,
  type SongPlan,
  type VoiceHint,
} from "@/agents/schemas";
import * as P from "@/agents/prompts";
import type { JobInputParams } from "@/shared/types";

// Stage 4
export function buildSongPlan(km: KnowledgeMap, input: JobInputParams): Promise<SongPlan> {
  const p = P.songPlanPrompt(km, input);
  return generateJson({ model: "flash", system: p.system, prompt: p.prompt, schema: SongPlanSchema });
}

// Stage 5
export function draftLyrics(plan: SongPlan, km: KnowledgeMap): Promise<LyricDraft> {
  const p = P.lyricDraftPrompt(plan, km);
  return generateJson({ model: "flash", system: p.system, prompt: p.prompt, schema: LyricDraftSchema });
}

// Stage 6
export function critiqueLyrics(
  draft: LyricDraft,
  km: KnowledgeMap,
  plan: SongPlan,
  input: JobInputParams,
): Promise<Critique> {
  const p = P.critiquePrompt(draft, km, plan, input);
  return generateJson({
    model: "flash",
    system: p.system,
    prompt: p.prompt,
    schema: CritiqueSchema,
    temperature: 0.3,
  });
}

// Stage 7
export function rewriteLyrics(
  draft: LyricDraft,
  km: KnowledgeMap,
  plan: SongPlan,
  critique: Critique,
): Promise<LyricDraft> {
  const p = P.rewritePrompt(draft, km, plan, critique);
  return generateJson({ model: "flash", system: p.system, prompt: p.prompt, schema: LyricDraftSchema });
}

// Stage 8 — independent grounding gate
export function factCheckLyrics(draft: LyricDraft, km: KnowledgeMap): Promise<Grounding> {
  const lines = draft.lines.length
    ? draft.lines
    : draft.taggedLyrics
        .split("\n")
        .filter((l) => l.trim() && !/^\[[^\]]+\]$/.test(l.trim()))
        .map((text) => ({ section: "", text: text.trim(), factIds: [] as string[] }));
  const p = P.groundingPrompt(lines, km);
  return generateJson({
    model: "flash",
    system: p.system,
    prompt: p.prompt,
    schema: GroundingSchema,
    temperature: 0.1,
  });
}

function voiceFromInput(input: JobInputParams): VoiceHint | undefined {
  if (!input.voiceGender && !input.voiceStyle) return undefined;
  return { gender: input.voiceGender, style: input.voiceStyle };
}

// Stage 9 — provider-agnostic music request
export async function buildMusicRequest(
  plan: SongPlan,
  draft: LyricDraft,
  input: JobInputParams,
): Promise<MusicRequest> {
  const p = P.styleParamsPrompt(plan, input);
  const req = await generateJson({
    model: "flash-lite",
    system: p.system,
    prompt: p.prompt,
    schema: MusicRequestSchema,
    temperature: 0.5,
  });
  return {
    ...req,
    lyrics: draft.taggedLyrics,
    durationSec: plan.targetDurationSec,
    genre: req.genre ?? plan.genre,
    voice: req.voice ?? voiceFromInput(input),
    seed: input.seed ?? req.seed,
  };
}

// Stage 11 — title + description
export function makeTitle(plan: SongPlan, draft: LyricDraft): Promise<SongMeta> {
  const p = P.titlePrompt(plan, draft);
  return generateJson({
    model: "flash-lite",
    system: p.system,
    prompt: p.prompt,
    schema: SongMetaSchema,
    temperature: 0.7,
  });
}

/** Remove lines flagged as contradicted by the grounding gate. */
export function dropContradictedLines(draft: LyricDraft, grounding: Grounding): LyricDraft {
  const bad = new Set(
    grounding.lineVerdicts
      .filter((v) => v.verdict === "contradicted")
      .map((v) => v.text.trim()),
  );
  if (!bad.size) return draft;
  const keptLines = draft.lines.filter((l) => !bad.has(l.text.trim()));
  const keptText = draft.taggedLyrics
    .split("\n")
    .filter((l) => !bad.has(l.trim()))
    .join("\n");
  return { taggedLyrics: keptText, lines: keptLines };
}

/** Build a minimal LyricDraft from raw user-edited lyrics (edit flow). */
export function draftFromText(taggedLyrics: string): LyricDraft {
  let section = "verse";
  const lines = taggedLyrics
    .split("\n")
    .map((raw) => {
      const t = raw.trim();
      const tag = t.match(/^\[([^\]]+)\]$/);
      if (tag) {
        section = tag[1];
        return null;
      }
      if (!t) return null;
      return { section, text: t, factIds: [] as string[] };
    })
    .filter((x): x is { section: string; text: string; factIds: string[] } => x !== null);
  return { taggedLyrics, lines };
}
