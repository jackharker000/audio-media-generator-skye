import type {
  Critique,
  Fact,
  KnowledgeMap,
  LyricDraft,
  SongPlan,
} from "@/agents/schemas";
import type { JobInputParams } from "@/shared/types";

export interface Prompt {
  system: string;
  prompt: string;
}

const factsJson = (facts: Fact[]) =>
  JSON.stringify(
    facts.map((f) => ({ id: f.factId, claim: f.claim, importance: f.importance, evidence: f.evidence })),
  );

// ---- Stage 3a: per-chunk fact extraction (map) ----------------------------

export function factExtractionPrompt(chunkText: string, focus?: string): Prompt {
  return {
    system:
      "You are a meticulous study-notes extractor. You extract ONLY facts that are explicitly stated in the provided text. You never infer, embellish, or add outside knowledge. Every fact must be backed by a verbatim quote from the text.",
    prompt: `Extract the atomic, memorizable facts from the text below.${
      focus ? `\n\nThe user wants to focus on: "${focus}". Prioritize facts related to this, but still capture other key facts.` : ""
    }

For each fact, output:
- factId: a short unique id ("f1", "f2", ...)
- claim: one self-contained sentence stating the fact
- importance: 1-5 (5 = essential to remember)
- evidence: a SHORT verbatim quote from the text that supports the claim
- sourceRef: a brief locator (heading/section) if obvious, else omit

Rules:
- Do NOT invent facts. If the text is thin, return fewer facts.
- Keep each claim atomic (one idea). Split compound statements.
- Prefer concrete, testable facts (definitions, numbers, names, causes, sequences).

Return JSON: {"facts":[{"factId","claim","importance","evidence","sourceRef?"}]}

TEXT:
"""
${chunkText}
"""`,
  };
}

// ---- Stage 3b: reduce to a ranked knowledge map ---------------------------

export function knowledgeReducePrompt(allFacts: Fact[], focus?: string, topN = 24): Prompt {
  return {
    system:
      "You consolidate extracted facts into a clean, deduplicated, ranked knowledge map for turning into a memorization song.",
    prompt: `Below is a JSON array of candidate facts extracted from a document (possibly with duplicates/overlaps).

Tasks:
1. Merge duplicates and near-duplicates (keep the clearest wording and its evidence).
2. Re-rank by importance for memorization${focus ? `, weighting toward the user's focus: "${focus}"` : ""}.
3. Keep the top ${topN} facts (fewer if the source is small).
4. Identify 2-6 overarching themes.
5. Preserve each kept fact's evidence verbatim. Reassign clean ids f1..fN.

Return JSON: {"facts":[{"factId","claim","importance","evidence","sourceRef?"}],"themes":[string],"focusApplied?":string}

CANDIDATE FACTS:
${factsJson(allFacts)}`,
  };
}

// ---- Stage 4: song plan ---------------------------------------------------

export function songPlanPrompt(km: KnowledgeMap, input: JobInputParams): Prompt {
  const genre = input.genre ?? "(choose a catchy, memorable genre)";
  return {
    system:
      "You are a music producer and learning scientist. You design song structures that maximize memorization using repetition, rhythm, and mnemonic hooks. The most important facts belong in the repeated chorus (spaced repetition).",
    prompt: `Design a song that helps someone memorize these facts.

Constraints & guidance:
- Genre/style preference: ${genre}. ${input.focusPrompt ? `User prompt: "${input.focusPrompt}".` : ""}
- Put the highest-importance facts in the CHORUS so they repeat.
- Group related facts within each verse so each section is coherent.
- Keep it catchy and singable; simple, repetitive hooks beat clever-but-forgettable.
- Target duration: ${input.targetDurationSec ?? 75} seconds.
- Assign every important fact to at least one section via its factId.

Return JSON matching:
{"workingTitle?","genre","mood","tempoBpm?","voiceHint?","targetDurationSec","hookConcept","sections":[{"type":"intro|verse|pre-chorus|chorus|bridge|outro","intent","factIds":[string]}]}

KNOWLEDGE MAP:
themes: ${JSON.stringify(km.themes)}
facts: ${factsJson(km.facts)}`,
  };
}

// ---- Stage 5: lyric draft -------------------------------------------------

export function lyricDraftPrompt(plan: SongPlan, km: KnowledgeMap): Prompt {
  return {
    system:
      "You are an expert lyricist who writes accurate, singable educational songs. You encode facts faithfully — never changing numbers, names, or meanings to fit a rhyme. Clarity of the facts is more important than poetic flourish.",
    prompt: `Write the full lyrics for this song plan.

Hard rules:
- Use ONLY the facts provided (by factId). Do NOT introduce facts not in the list.
- Never distort a fact (no wrong numbers/names) to make a rhyme.
- Mark structure with tags on their own lines: [intro] [verse] [pre-chorus] [chorus] [bridge] [outro].
- The chorus should be the catchiest, most repeated, fact-dense hook.
- Keep lines short enough to sing comfortably (~6-10 syllables typical).
- Aim for the target duration (~${plan.targetDurationSec}s).

Also return a per-line mapping of which factId(s) each lyric line encodes (skip purely structural/filler lines or give them an empty factIds array).

Return JSON:
{"taggedLyrics":"...full lyrics with [tags]...","lines":[{"section":"verse|chorus|...","text":"line text","factIds":[string]}]}

SONG PLAN:
${JSON.stringify({ genre: plan.genre, mood: plan.mood, hookConcept: plan.hookConcept, sections: plan.sections })}

FACTS:
${factsJson(km.facts)}`,
  };
}

// ---- Stage 6: critique ----------------------------------------------------

export function critiquePrompt(
  draft: LyricDraft,
  km: KnowledgeMap,
  plan: SongPlan,
  input: JobInputParams,
): Prompt {
  return {
    system:
      "You are a strict lyric critic AND fact-checker for an educational song. You are skeptical and precise. You flag any line whose claim is not supported by the source facts, and any important fact that is missing.",
    prompt: `Evaluate these lyrics on four axes and decide pass/fail.

Axes:
- factual: does every factual line match the evidence of the fact it claims? Flag any invented/distorted numbers, names, or relationships.
- coverage: are the high-importance facts present?
- memorability: rhyme, rhythm, hook strength, repetition of key facts.
- singability: are lines a comfortable length and natural to sing?
${input.focusPrompt ? `- Also check it respects the user's request: "${input.focusPrompt}".` : ""}

Scoring: 0-10 per axis. pass = true only if factualFidelity >= 8 AND coverage >= 6 AND no high-severity factual issues.

Return JSON:
{"issues":[{"severity":"low|medium|high","axis":"factual|coverage|memorability|singability|style","lineRef?":"the offending line","detail":"...","suggestion?":"..."}],"factualErrors":["lines that misstate a fact"],"scores":{"factualFidelity":n,"coverage":n,"memorability":n,"singability":n},"pass":bool}

LYRICS:
"""
${draft.taggedLyrics}
"""

LINE→FACT MAP: ${JSON.stringify(draft.lines)}

SOURCE FACTS: ${factsJson(km.facts)}`,
  };
}

// ---- Stage 7: rewrite -----------------------------------------------------

export function rewritePrompt(
  draft: LyricDraft,
  km: KnowledgeMap,
  plan: SongPlan,
  critique: Critique,
): Prompt {
  return {
    system:
      "You are an expert lyricist revising a draft to fix a critic's issues while preserving structure and factual accuracy. Fix problems without introducing new facts or distortions.",
    prompt: `Revise the lyrics to address the critique. Preserve the [tags] structure and keep every claim faithful to the source facts. Prioritize fixing factual errors first, then coverage, then memorability/singability.

Return the SAME JSON shape as a draft:
{"taggedLyrics":"...","lines":[{"section","text","factIds":[string]}]}

CRITIQUE:
${JSON.stringify(critique)}

CURRENT LYRICS:
"""
${draft.taggedLyrics}
"""

SOURCE FACTS: ${factsJson(km.facts)}`,
  };
}

// ---- Stage 8: independent grounding gate ----------------------------------

export function groundingPrompt(lines: { text: string }[], km: KnowledgeMap): Prompt {
  return {
    system:
      "You are an independent fact-verification system. You receive song lines and a set of source facts with evidence. For each line you decide if its factual content is entailed by the evidence. You have NOT seen how the lyrics were written and you owe the author nothing — be adversarial.",
    prompt: `For each lyric line, classify it:
- "supported": its factual claim is entailed by the source evidence (or it is purely structural/filler with no factual claim).
- "unsupported": it makes a factual claim that the evidence neither confirms nor denies.
- "contradicted": it states something that conflicts with the evidence (e.g. wrong number/name).

Set hardFail = true if ANY line is "contradicted".

Return JSON: {"lineVerdicts":[{"text","verdict":"supported|unsupported|contradicted","evidence?":"the relevant source span"}],"hardFail":bool}

LINES:
${JSON.stringify(lines.map((l) => l.text))}

SOURCE FACTS (with evidence):
${factsJson(km.facts)}`,
  };
}

// ---- Stage 9: style params ------------------------------------------------

export function styleParamsPrompt(plan: SongPlan, input: JobInputParams): Prompt {
  const voiceBits = [
    input.voiceGender && `${input.voiceGender} vocal`,
    input.voiceStyle && input.voiceStyle,
  ].filter(Boolean);
  return {
    system:
      "You translate a song's mood/genre into a concise, comma-separated style-tag string for a text-to-music model, plus structured parameters.",
    prompt: `Produce music-generation parameters for this song.

- styleTags: a comma-separated list of genre, mood, tempo, instrumentation, and vocal descriptors a text-to-music model understands (e.g. "upbeat pop, female vocal, 120 bpm, bright synths, catchy"). ${
      voiceBits.length ? `Include: ${voiceBits.join(", ")}.` : ""
    }
- durationSec: ${plan.targetDurationSec}
- genre: the primary genre
- voice: {gender?, style?: "sung|rap|spoken", descriptor?}

Do NOT include the lyrics in styleTags. Keep styleTags under ~200 characters.

Return JSON: {"lyrics":"","styleTags":"...","durationSec":${plan.targetDurationSec},"genre":"...","voice":{...}}
(Leave "lyrics" as an empty string — it will be filled in by the system.)

SONG PLAN: ${JSON.stringify({ genre: plan.genre, mood: plan.mood, tempoBpm: plan.tempoBpm, voiceHint: plan.voiceHint })}`,
  };
}

// ---- Stage 11: title/description ------------------------------------------

export function titlePrompt(plan: SongPlan, draft: LyricDraft): Prompt {
  return {
    system: "You write short, catchy titles and one-line descriptions for study songs.",
    prompt: `Give this study song a catchy, descriptive title (max ~6 words) and a one-sentence description of what it helps you memorize.

Return JSON: {"title":"...","description":"..."}

GENRE: ${plan.genre}; HOOK: ${plan.hookConcept}
FIRST LINES: ${draft.taggedLyrics.slice(0, 400)}`,
  };
}
