import { describe, expect, it } from "vitest";
import { estimateTokens, mapWithConcurrency, slugify, stableHash } from "@/lib/utils";

describe("utils", () => {
  it("stableHash is deterministic and differs for different input", () => {
    expect(stableHash("abc")).toBe(stableHash("abc"));
    expect(stableHash("abc")).not.toBe(stableHash("abd"));
  });

  it("slugify produces url-safe slugs", () => {
    expect(slugify("Biology — Cell Respiration!")).toBe("biology-cell-respiration");
    expect(slugify("  spaces   here ")).toBe("spaces-here");
  });

  it("estimateTokens scales with length", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("aaaa")).toBe(1);
    expect(estimateTokens("a".repeat(40))).toBe(10);
  });

  it("mapWithConcurrency preserves order and bounds concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = await mapWithConcurrency(items, 3, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
    expect(maxActive).toBeLessThanOrEqual(3);
  });
});
