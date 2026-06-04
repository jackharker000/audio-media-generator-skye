import { GoogleGenAI } from "@google/genai";
import { env, features, optionalEnv } from "@/lib/env";
import { putObject } from "@/storage";
import type { MusicProvider, MusicRequest, MusicResult } from "../types";

/**
 * Music engine using **Gemini TTS** — runs on the same free AI Studio
 * GEMINI_API_KEY (no Google Cloud billing, unlike Cloud Text-to-Speech).
 * Gemini speaks/raps the lyrics with a musical, rhythmic delivery. Output is
 * raw PCM, which we wrap into a WAV container. Synchronous — no webhooks.
 */

function stripTags(lyrics: string): string {
  return lyrics
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^\[[^\]]+\]$/.test(l))
    .join("\n");
}

function pickVoice(req: MusicRequest): string {
  switch (req.voice?.gender) {
    case "male":
      return optionalEnv("GEMINI_TTS_VOICE_MALE") ?? "Puck";
    case "neutral":
      return "Aoede";
    default:
      return optionalEnv("GEMINI_TTS_VOICE_FEMALE") ?? "Kore";
  }
}

function buildPrompt(req: MusicRequest): string {
  const mode =
    req.voice?.style === "rap"
      ? "Perform the following lyrics as a rhythmic rap"
      : "Perform the following lyrics with a catchy, upbeat, musical and rhythmic delivery, like a song";
  return `${mode}. Genre: ${req.genre ?? "pop"}. Keep a steady tempo and clear pronunciation so every word is easy to memorize.\n\n${stripTags(
    req.lyrics,
  )}`;
}

function sampleRateFromMime(mime: string): number {
  const m = /rate=(\d+)/.exec(mime || "");
  return m ? parseInt(m[1], 10) : 24000;
}

/** Wrap raw little-endian 16-bit mono PCM in a minimal WAV header. */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const channels = 1;
  const bits = 16;
  const byteRate = (sampleRate * channels * bits) / 8;
  const blockAlign = (channels * bits) / 8;
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bits, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Tolerate model-name drift across Gemini TTS releases.
const candidateModels = (): string[] =>
  [
    optionalEnv("GEMINI_TTS_MODEL"),
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-flash-tts",
    "gemini-2.5-pro-preview-tts",
  ].filter(Boolean) as string[];

async function synthesize(req: MusicRequest): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey: env.geminiApiKey()! });
  const prompt = buildPrompt(req);
  const voiceName = pickVoice(req);
  let lastErr: unknown;

  for (const model of candidateModels()) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        } as any,
      });
      const parts = (res.candidates?.[0]?.content?.parts ?? []) as any[];
      const audio = parts.find((p) => p?.inlineData?.data);
      const b64: string | undefined = audio?.inlineData?.data;
      const mime: string = audio?.inlineData?.mimeType ?? "audio/L16;rate=24000";
      if (!b64) throw new Error("no audio in response");
      return pcmToWav(Buffer.from(b64, "base64"), sampleRateFromMime(mime));
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("Gemini TTS failed: " + String((lastErr as Error)?.message ?? lastErr));
}

export const geminiTts: MusicProvider = {
  id: "gemini-tts",
  capabilities: {
    sings: false,
    mode: "sync",
    maxDurationSec: 240,
    supportsSeed: false,
    voiceControl: "params",
    estCostPerSongUsd: 0,
    free: true,
  },

  async render(req, { jobId }): Promise<MusicResult> {
    if (!features.hasGemini()) {
      throw new Error("GEMINI_API_KEY not set — Gemini TTS can't run.");
    }
    const wav = await synthesize(req);
    const key = `songs/${jobId}.wav`;
    await putObject(key, wav, "audio/wav");
    return { storageKey: key, contentType: "audio/wav" };
  },
};
