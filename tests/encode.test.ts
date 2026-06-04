import { describe, expect, it } from "vitest";
import { encodeFinal } from "@/music/encode";

/** A short 440Hz tone as 16-bit PCM at the given sample rate. */
function tone(sampleRate: number, seconds: number): Int16Array {
  const n = Math.floor(sampleRate * seconds);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000);
  return pcm;
}

describe("encodeFinal", () => {
  it("returns a non-empty buffer whose container matches the reported type", async () => {
    const out = await encodeFinal(tone(24000, 0.25), 24000);
    expect(out.buffer.length).toBeGreaterThan(0);

    // The encoder prefers MP3 but falls back to WAV when ffmpeg is unavailable
    // (e.g. an offline install). Either is valid — just assert the bytes match
    // the advertised format so the stored Content-Type is always honest.
    if (out.ext === "mp3") {
      expect(out.contentType).toBe("audio/mpeg");
      const head = out.buffer.subarray(0, 3);
      const isId3 = head.toString("ascii") === "ID3";
      const isFrameSync = head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
      expect(isId3 || isFrameSync).toBe(true);
    } else {
      expect(out.ext).toBe("wav");
      expect(out.contentType).toBe("audio/wav");
      expect(out.buffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(out.buffer.subarray(8, 12).toString("ascii")).toBe("WAVE");
    }
  });
});
