import { describe, expect, it } from "vitest";
import { GENRES, VOICE_GENDERS, genreLabel } from "@/shared/constants";

describe("shared constants", () => {
  it("title-cases simple and hyphenated genres", () => {
    expect(genreLabel("pop")).toBe("Pop");
    expect(genreLabel("hip-hop")).toBe("Hip-Hop");
    expect(genreLabel("lo-fi")).toBe("Lo-Fi");
  });

  it("special-cases r&b", () => {
    expect(genreLabel("r&b")).toBe("R&B");
  });

  it("labels every genre in the canonical list with a leading capital", () => {
    for (const g of GENRES) {
      const label = genreLabel(g);
      expect(label.length).toBeGreaterThan(0);
      expect(label[0]).toBe(label[0].toUpperCase());
    }
  });

  it("exposes the expected voice genders", () => {
    expect([...VOICE_GENDERS]).toEqual(["female", "male", "neutral"]);
  });
});
