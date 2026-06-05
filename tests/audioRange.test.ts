import { describe, expect, it } from "vitest";
import { parseRange } from "@/server/httpRange";

describe("parseRange", () => {
  const size = 1000;

  it("returns null when there is no Range header", () => {
    expect(parseRange(null, size)).toBeNull();
    expect(parseRange("", size)).toBeNull();
  });

  it("returns null for malformed or multi-range headers (caller serves full body)", () => {
    expect(parseRange("megabytes=0-10", size)).toBeNull();
    expect(parseRange("bytes=0-10, 20-30", size)).toBeNull();
    expect(parseRange("bytes=abc-def", size)).toBeNull();
    expect(parseRange("bytes=-", size)).toBeNull();
  });

  it("parses a closed range", () => {
    expect(parseRange("bytes=0-499", size)).toEqual({ start: 0, end: 499 });
    expect(parseRange("bytes=200-799", size)).toEqual({ start: 200, end: 799 });
  });

  it("parses an open-ended range to the last byte", () => {
    expect(parseRange("bytes=500-", size)).toEqual({ start: 500, end: 999 });
  });

  it("clamps an end past the resource size", () => {
    expect(parseRange("bytes=900-100000", size)).toEqual({ start: 900, end: 999 });
  });

  it("parses a suffix range (last N bytes)", () => {
    expect(parseRange("bytes=-200", size)).toEqual({ start: 800, end: 999 });
    // Suffix larger than the file clamps to the whole file.
    expect(parseRange("bytes=-5000", size)).toEqual({ start: 0, end: 999 });
  });

  it("flags unsatisfiable ranges", () => {
    expect(parseRange("bytes=1000-1001", size)).toBe("unsatisfiable"); // start >= size
    expect(parseRange("bytes=600-500", size)).toBe("unsatisfiable"); // start > end
    expect(parseRange("bytes=-0", size)).toBe("unsatisfiable"); // empty suffix
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseRange("  bytes=0-9  ", size)).toEqual({ start: 0, end: 9 });
  });
});
