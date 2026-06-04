import { env } from "@/lib/env";
import type { MusicProvider } from "./types";
import { geminiTts } from "./providers/geminiTts";
import { googleTtsBeat } from "./providers/googleTtsBeat";

/**
 * Music engines, both Google and free:
 *   - "gemini-tts"      (default): uses the AI Studio GEMINI_API_KEY — no billing.
 *   - "google-tts-beat": Google Cloud Text-to-Speech (needs a billing-enabled
 *                        project) over an optional beat.
 */
const PROVIDERS: Record<string, MusicProvider> = {
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

/** Resolve the provider: explicit request → configured default → Gemini TTS. */
export function resolveProvider(requested?: string): MusicProvider {
  if (requested && PROVIDERS[requested]) return PROVIDERS[requested];
  return PROVIDERS[env.musicProvider()] ?? geminiTts;
}
