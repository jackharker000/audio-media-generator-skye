import { describe, expect, it } from "vitest";
import { chunkText } from "@/extract/chunk";

describe("chunkText", () => {
  it("returns a single chunk for short text", () => {
    const chunks = chunkText("Hello world.\n\nA short note.");
    expect(chunks.length).toBe(1);
    expect(chunks[0].text).toContain("Hello world");
  });

  it("splits long text into multiple chunks under the token budget", () => {
    const para = "word ".repeat(500); // ~2500 chars
    const text = Array.from({ length: 20 }, () => para).join("\n\n");
    const chunks = chunkText(text, { maxTokens: 2000 }); // ~8000 chars/chunk
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.length).toBeLessThanOrEqual(2000 * 4 + 10);
      expect(c.tokenEstimate).toBeGreaterThan(0);
    }
  });

  it("hard-splits a single oversized paragraph", () => {
    const huge = "x".repeat(50_000);
    const chunks = chunkText(huge, { maxTokens: 1000 });
    expect(chunks.length).toBeGreaterThan(1);
  });
});
