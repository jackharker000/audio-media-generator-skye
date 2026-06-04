import { promises as fs } from "node:fs";
import path from "node:path";
import { features } from "@/lib/env";
import { putObject } from "@/storage";
import {
  downmixToMonoFloat,
  floatToInt16,
  int16ToFloat,
  normalize,
  resampleMono,
  wavDecode,
} from "../audio";
import { encodeFinal } from "../encode";
import { defaultArrangement, synthesizeArrangement } from "../synth";
import type { MusicProvider, MusicRequest, MusicResult } from "../types";
import { geminiSpeechPcm } from "./geminiTts";

const MAX_SECONDS = 120;

/**
 * The full "song" engine, 100% free and pure-JS (Vercel-friendly):
 *   Gemini TTS vocal  +  synthesized backing (chords/bass/drums from the
 *   Gemini-designed arrangement)  +  optional royalty-free loop  → mixed WAV.
 */

/** Load an optional royalty-free loop (public/beats/<genre>.wav) as mono float. */
async function loadLoop(genre: string | undefined, sr: number): Promise<Float32Array | null> {
  const dir = path.join(process.cwd(), "public", "beats");
  const names = [
    genre && `${genre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.wav`,
    "default.wav",
  ].filter(Boolean) as string[];
  for (const nm of names) {
    try {
      const buf = await fs.readFile(path.join(dir, nm));
      const dec = wavDecode(buf);
      return resampleMono(downmixToMonoFloat(dec.pcm, dec.channels), dec.sampleRate, sr);
    } catch {
      /* try next */
    }
  }
  return null;
}

export const geminiSong: MusicProvider = {
  id: "gemini-song",
  capabilities: {
    sings: false,
    mode: "sync",
    maxDurationSec: MAX_SECONDS,
    supportsSeed: false,
    voiceControl: "params",
    estCostPerSongUsd: 0,
    free: true,
  },

  async render(req, { jobId }): Promise<MusicResult> {
    if (!features.hasGemini()) throw new Error("GEMINI_API_KEY not set — can't generate audio.");

    // 1. Vocal (Gemini TTS → raw PCM).
    const { pcm, sampleRate } = await geminiSpeechPcm(req);
    const vocal = int16ToFloat(pcm);
    const durationSec = Math.min(MAX_SECONDS, vocal.length / sampleRate + 1.2);

    // 2. Synthesized backing from the Gemini-designed arrangement (or a default).
    const arrangement = req.arrangement ?? defaultArrangement(req.genre);
    const backing = synthesizeArrangement(arrangement, durationSec, sampleRate);

    // 3. Optional royalty-free loop layered in.
    const loop = await loadLoop(req.genre, sampleRate).catch(() => null);

    // 4. Mix: vocal up front, backing ducked beneath, loop subtle.
    const N = Math.max(vocal.length, backing.length);
    const mix = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const v = i < vocal.length ? vocal[i] : 0;
      const b = i < backing.length ? backing[i] * 0.5 : 0;
      const l = loop && loop.length ? loop[i % loop.length] * 0.3 : 0;
      mix[i] = v + b + l;
    }
    normalize(mix, 0.97);

    const { buffer, contentType, ext } = await encodeFinal(floatToInt16(mix), sampleRate);
    const key = `songs/${jobId}.${ext}`;
    await putObject(key, buffer, contentType);
    return { storageKey: key, contentType };
  },
};
