import { env } from "@/lib/env";
import type { MusicProvider } from "./types";
import { geminiSong } from "./providers/geminiSong";
import { geminiTts } from "./providers/geminiTts";
import { googleTtsBeat } from "./providers/googleTtsBeat";

/**
 * Music engines (all Google, all free):
 *   - "gemini-song" (default): Gemini TTS vocal + pure-JS synth backing
 *     (chords/bass/drums from a Gemini-designed arrangement) + optional loops.
 *   - "gemini-tts": voice only (no backing music).
 *   - "google-tts-beat": Cloud TTS over an ffmpeg-mixed beat (needs Cloud billing).
 */
const PROVIDERS: Record<string, MusicProvider> = {
  [geminiSong.id]: geminiSong,
  [geminiTts.id]: geminiTts,
  [googleTtsBeat.id]: googleTtsBeat,
};

export function getProvider(id: string): MusicProvider {
  const p = PROVIDERS[id];
  if (!p) throw new Error(`Unknown music provider: ${id}`);
  return p;
}

export function listProviders(): MusicProvider[] {
  return Object.values(PROVIDERS);
}

/** Resolve the provider: explicit request → configured default → gemini-song. */
export function resolveProvider(requested?: string): MusicProvider {
  if (requested && PROVIDERS[requested]) return PROVIDERS[requested];
  return PROVIDERS[env.musicProvider()] ?? geminiSong;
}
