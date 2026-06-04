import { describe, expect, it } from "vitest";
import {
  floatToInt16,
  int16ToFloat,
  resampleMono,
  wavDecode,
  wavEncode,
} from "@/music/audio";
import { defaultArrangement, synthesizeArrangement } from "@/music/synth";

describe("audio utils", () => {
  it("wav encode/decode round-trips 16-bit PCM", () => {
    const pcm = new Int16Array([0, 1000, -1000, 32767, -32768, 5]);
    const dec = wavDecode(wavEncode(pcm, 24000));
    expect(dec.sampleRate).toBe(24000);
    expect(dec.channels).toBe(1);
    expect(Array.from(dec.pcm)).toEqual(Array.from(pcm));
  });

  it("float<->int16 round-trips approximately", () => {
    const f = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const back = int16ToFloat(floatToInt16(f));
    for (let i = 0; i < f.length; i++) expect(Math.abs(back[i] - f[i])).toBeLessThan(0.001);
  });

  it("resample changes length by the rate ratio", () => {
    expect(resampleMono(new Float32Array(1000).fill(0.2), 24000, 12000).length).toBe(500);
  });
});

describe("synth", () => {
  it("renders the requested number of samples without clipping or silence", () => {
    const sr = 24000;
    const buf = synthesizeArrangement(defaultArrangement("pop"), 2, sr);
    expect(buf.length).toBe(2 * sr);
    let peak = 0;
    for (const x of buf) peak = Math.max(peak, Math.abs(x));
    expect(peak).toBeLessThanOrEqual(1.0001);
    expect(peak).toBeGreaterThan(0);
  });

  it("defaultArrangement yields a valid, synthesizable progression", () => {
    const arr = defaultArrangement("lo-fi");
    expect(arr.chords.length).toBeGreaterThan(0);
    expect(arr.tempoBpm).toBeGreaterThan(0);
  });
});
