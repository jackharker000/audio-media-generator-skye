import { describe, expect, it } from "vitest";
import { getProvider, listProviders, resolveProvider } from "@/music/registry";

describe("music registry (Google, free)", () => {
  it("exposes the engines and throws on unknown", () => {
    expect(getProvider("gemini-song").id).toBe("gemini-song");
    expect(getProvider("gemini-song").capabilities.free).toBe(true);
    expect(getProvider("gemini-tts").id).toBe("gemini-tts");
    expect(() => getProvider("fal-acestep")).toThrow();
  });

  it("defaults to the full gemini-song engine, honoring explicit requests", () => {
    expect(resolveProvider().id).toBe("gemini-song");
    expect(resolveProvider("gemini-tts").id).toBe("gemini-tts");
    expect(resolveProvider("nonsense").id).toBe("gemini-song");
  });

  it("lists the available engines", () => {
    const ids = listProviders().map((p) => p.id);
    expect(ids).toContain("gemini-song");
    expect(ids).toContain("gemini-tts");
    expect(ids).toContain("google-tts-beat");
  });
});
