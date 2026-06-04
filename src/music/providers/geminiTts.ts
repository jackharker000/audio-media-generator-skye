import { GoogleGenAI } from "@google/genai";
import { env, features, optionalEnv } from "@/lib/env";
import { putObject } from "@/storage";
import { bufferToInt16LE, wavEncode } from "../audio";
import type { MusicProvider, MusicRequest, MusicResult } from "../types";

/**
 * Gemini TTS speech (no Google Cloud billing — uses the AI Studio key).
 * `geminiSpeechPcm` returns the raw vocal PCM so the song engine can mix music
 * under it; the `gemini-tts` provider just wraps that PCM as a WAV (voice only).
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

const candidateModels = (): string[] =>
  [
    optionalEnv("GEMINI_TTS_MODEL"),
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-flash-tts",
    "gemini-2.5-pro-preview-tts",
  ].filter(Boolean) as string[];

/** Synthesize the lyrics to raw PCM, rotating across keys and tolerating model drift. */
export async function geminiSpeechPcm(
  req: MusicRequest,
): Promise<{ pcm: Int16Array; sampleRate: number }> {
  const keys = env.geminiKeys();
  if (keys.length === 0) throw new Error("No Gemini key configured for TTS");
  const prompt = buildPrompt(req);
  const voiceName = pickVoice(req);
  let lastErr: unknown;

  for (const key of keys) {
    const ai = new GoogleGenAI({ apiKey: key });
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
        return { pcm: bufferToInt16LE(Buffer.from(b64, "base64")), sampleRate: sampleRateFromMime(mime) };
      } catch (e) {
        lastErr = e;
      }
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
    const { pcm, sampleRate } = await geminiSpeechPcm(req);
    const key = `songs/${jobId}.wav`;
    await putObject(key, wavEncode(pcm, sampleRate), "audio/wav");
    return { storageKey: key, contentType: "audio/wav" };
  },
};
