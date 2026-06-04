import { describe, expect, it } from "vitest";
import { getProvider, listProviders, resolveProvider } from "@/music/registry";

describe("music registry (Google-only)", () => {
  it("exposes the Google TTS engine and throws on unknown", () => {
    expect(getProvider("google-tts-beat").id).toBe("google-tts-beat");
    expect(getProvider("google-tts-beat").capabilities.free).toBe(true);
    expect(() => getProvider("fal-acestep")).toThrow();
  });

  it("resolves to the free Google engine regardless of request", () => {
    expect(resolveProvider().id).toBe("google-tts-beat");
    expect(resolveProvider("anything").id).toBe("google-tts-beat");
  });

  it("lists at least the Google engine", () => {
    expect(listProviders().map((p) => p.id)).toContain("google-tts-beat");
  });
});
