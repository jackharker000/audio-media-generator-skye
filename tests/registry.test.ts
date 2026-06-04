import { describe, expect, it } from "vitest";
import { getProvider, listProviders, resolveProvider } from "@/music/registry";

describe("music registry (Google, free)", () => {
  it("exposes the Gemini TTS engine and throws on unknown", () => {
    expect(getProvider("gemini-tts").id).toBe("gemini-tts");
    expect(getProvider("gemini-tts").capabilities.free).toBe(true);
    expect(() => getProvider("fal-acestep")).toThrow();
  });

  it("defaults to the no-billing Gemini engine, honoring explicit requests", () => {
    expect(resolveProvider().id).toBe("gemini-tts");
    expect(resolveProvider("google-tts-beat").id).toBe("google-tts-beat");
    expect(resolveProvider("nonsense").id).toBe("gemini-tts");
  });

  it("lists the available engines", () => {
    const ids = listProviders().map((p) => p.id);
    expect(ids).toContain("gemini-tts");
    expect(ids).toContain("google-tts-beat");
  });
});
