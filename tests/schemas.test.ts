import { describe, expect, it } from "vitest";
import {
  KnowledgeMapSchema,
  MusicRequestSchema,
  GroundingSchema,
} from "@/agents/schemas";

describe("schemas", () => {
  it("accepts a valid knowledge map", () => {
    const km = KnowledgeMapSchema.parse({
      facts: [{ factId: "f1", claim: "Water boils at 100C", importance: 5, evidence: "boils at 100C" }],
      themes: ["states of matter"],
    });
    expect(km.facts[0].factId).toBe("f1");
  });

  it("rejects an out-of-range importance", () => {
    expect(() =>
      KnowledgeMapSchema.parse({
        facts: [{ factId: "f1", claim: "x", importance: 9, evidence: "x" }],
        themes: [],
      }),
    ).toThrow();
  });

  it("validates a music request and its duration bounds", () => {
    const req = MusicRequestSchema.parse({
      lyrics: "[verse] hello",
      styleTags: "upbeat pop, female vocal",
      durationSec: 75,
    });
    expect(req.durationSec).toBe(75);
    expect(() =>
      MusicRequestSchema.parse({ lyrics: "x", styleTags: "y", durationSec: 9 }),
    ).toThrow();
  });

  it("parses a grounding verdict set", () => {
    const g = GroundingSchema.parse({
      hardFail: false,
      lineVerdicts: [{ text: "a", verdict: "supported" }],
    });
    expect(g.lineVerdicts[0].verdict).toBe("supported");
  });
});
