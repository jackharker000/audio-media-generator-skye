import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the model-backed stage functions; keep the real dropContradictedLines.
vi.mock("@/pipeline/stages/songwriting", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/pipeline/stages/songwriting")>();
  return {
    ...actual,
    critiqueLyrics: vi.fn(),
    rewriteLyrics: vi.fn(),
    factCheckLyrics: vi.fn(),
  };
});

import { refineAndVerify, type StageRunner } from "@/pipeline/refine";
import { critiqueLyrics, rewriteLyrics, factCheckLyrics } from "@/pipeline/stages/songwriting";
import type { Critique, Grounding, KnowledgeMap, LyricDraft, SongPlan } from "@/agents/schemas";

const runner: StageRunner = { run: (_id, _stage, fn) => fn() };

const km: KnowledgeMap = { facts: [], themes: [] };
const plan: SongPlan = {
  genre: "pop",
  mood: "upbeat",
  targetDurationSec: 75,
  hookConcept: "remember",
  sections: [{ type: "chorus", intent: "hook", factIds: [] }],
};
const input = {};
const baseDraft: LyricDraft = {
  taggedLyrics: "[verse]\nLine A\nLine B",
  lines: [
    { section: "verse", text: "Line A", factIds: [] },
    { section: "verse", text: "Line B", factIds: [] },
  ],
};

const pass: Critique = {
  issues: [],
  factualErrors: [],
  scores: { factualFidelity: 9, coverage: 8, memorability: 8, singability: 8 },
  pass: true,
};
const failC: Critique = { ...pass, pass: false };
const groundingOk: Grounding = { hardFail: false, lineVerdicts: [] };

beforeEach(() => vi.clearAllMocks());

describe("refineAndVerify", () => {
  it("returns the draft unchanged when critique passes and grounding is clean", async () => {
    vi.mocked(critiqueLyrics).mockResolvedValueOnce(pass);
    vi.mocked(factCheckLyrics).mockResolvedValueOnce(groundingOk);

    const out = await refineAndVerify(runner, { draft: baseDraft, km, plan, input, maxRewrites: 2 });

    expect(out).toBe(baseDraft);
    expect(critiqueLyrics).toHaveBeenCalledTimes(1);
    expect(rewriteLyrics).not.toHaveBeenCalled();
  });

  it("rewrites once when the first critique fails, then proceeds", async () => {
    const improved: LyricDraft = { ...baseDraft, taggedLyrics: baseDraft.taggedLyrics + "\nfixed" };
    vi.mocked(critiqueLyrics).mockResolvedValueOnce(failC).mockResolvedValueOnce(pass);
    vi.mocked(rewriteLyrics).mockResolvedValueOnce(improved);
    vi.mocked(factCheckLyrics).mockResolvedValueOnce(groundingOk);

    const out = await refineAndVerify(runner, { draft: baseDraft, km, plan, input, maxRewrites: 2 });

    expect(rewriteLyrics).toHaveBeenCalledTimes(1);
    expect(out).toBe(improved);
  });

  it("stops rewriting at the max-rewrite cap", async () => {
    vi.mocked(critiqueLyrics).mockResolvedValue(failC);
    vi.mocked(rewriteLyrics).mockResolvedValue(baseDraft);
    vi.mocked(factCheckLyrics).mockResolvedValueOnce(groundingOk);

    await refineAndVerify(runner, { draft: baseDraft, km, plan, input, maxRewrites: 2 });

    // i = 0,1,2 critiques; rewrites only at i = 0,1 (break before rewrite at the cap)
    expect(critiqueLyrics).toHaveBeenCalledTimes(3);
    expect(rewriteLyrics).toHaveBeenCalledTimes(2);
  });

  it("repairs contradicted lines and passes the re-check", async () => {
    vi.mocked(critiqueLyrics).mockResolvedValueOnce(pass);
    vi.mocked(factCheckLyrics)
      .mockResolvedValueOnce({
        hardFail: true,
        lineVerdicts: [
          { text: "Line A", verdict: "supported" },
          { text: "Line B", verdict: "contradicted", evidence: "not supported" },
        ],
      })
      .mockResolvedValueOnce(groundingOk);

    const out = await refineAndVerify(runner, { draft: baseDraft, km, plan, input, maxRewrites: 1 });

    expect(out.taggedLyrics).toContain("Line A");
    expect(out.taggedLyrics).not.toContain("Line B");
    expect(factCheckLyrics).toHaveBeenCalledTimes(2);
  });

  it("hard-fails when contradictions can't be verified after repair", async () => {
    vi.mocked(critiqueLyrics).mockResolvedValueOnce(pass);
    vi.mocked(factCheckLyrics).mockResolvedValue({
      hardFail: true,
      lineVerdicts: [{ text: "Line B", verdict: "contradicted" }],
    });

    await expect(
      refineAndVerify(runner, { draft: baseDraft, km, plan, input, maxRewrites: 1 }),
    ).rejects.toThrow(/verify/i);
  });
});
