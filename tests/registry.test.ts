import { describe, expect, it } from "vitest";
import { getProvider, resolveProviderChain } from "@/music/registry";

describe("music registry", () => {
  it("returns known providers and throws on unknown", () => {
    expect(getProvider("fal-acestep").id).toBe("fal-acestep");
    expect(getProvider("google-tts-beat").capabilities.free).toBe(true);
    expect(() => getProvider("nope")).toThrow();
  });

  it("puts the requested provider first, dedups, and appends fallbacks", () => {
    const chain = resolveProviderChain("sonauto").map((p) => p.id);
    expect(chain[0]).toBe("sonauto");
    expect(new Set(chain).size).toBe(chain.length); // no dupes
    expect(chain).toContain("google-tts-beat"); // free fallback present by default
  });

  it("defaults to a usable chain with no request", () => {
    const chain = resolveProviderChain().map((p) => p.id);
    expect(chain.length).toBeGreaterThan(0);
    expect(chain).toContain("fal-acestep");
  });
});
