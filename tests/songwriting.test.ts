import { describe, expect, it } from "vitest";
import { dropContradictedLines, draftFromText } from "@/pipeline/stages/songwriting";
import type { Grounding, LyricDraft } from "@/agents/schemas";

describe("dropContradictedLines", () => {
  it("removes only contradicted lines from text and line map", () => {
    const draft: LyricDraft = {
      taggedLyrics: "[verse]\nThe sky is blue\nThe grass is purple\n[chorus]\nRemember this",
      lines: [
        { section: "verse", text: "The sky is blue", factIds: ["f1"] },
        { section: "verse", text: "The grass is purple", factIds: ["f2"] },
        { section: "chorus", text: "Remember this", factIds: [] },
      ],
    };
    const grounding: Grounding = {
      hardFail: true,
      lineVerdicts: [
        { text: "The sky is blue", verdict: "supported" },
        { text: "The grass is purple", verdict: "contradicted", evidence: "grass is green" },
        { text: "Remember this", verdict: "supported" },
      ],
    };
    const repaired = dropContradictedLines(draft, grounding);
    expect(repaired.taggedLyrics).not.toContain("purple");
    expect(repaired.taggedLyrics).toContain("The sky is blue");
    expect(repaired.lines.find((l) => l.text.includes("purple"))).toBeUndefined();
    expect(repaired.lines.length).toBe(2);
  });

  it("returns the draft unchanged when nothing is contradicted", () => {
    const draft: LyricDraft = { taggedLyrics: "[verse]\nA fact", lines: [] };
    const grounding: Grounding = {
      hardFail: false,
      lineVerdicts: [{ text: "A fact", verdict: "supported" }],
    };
    expect(dropContradictedLines(draft, grounding)).toBe(draft);
  });
});

describe("draftFromText", () => {
  it("parses section tags and skips empty lines", () => {
    const draft = draftFromText("[verse]\nLine one\n\n[chorus]\nHook line");
    expect(draft.lines).toEqual([
      { section: "verse", text: "Line one", factIds: [] },
      { section: "chorus", text: "Hook line", factIds: [] },
    ]);
    expect(draft.taggedLyrics).toContain("[chorus]");
  });
});
