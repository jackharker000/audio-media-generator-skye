import type { MusicProvider } from "./types";
import { googleTtsBeat } from "./providers/googleTtsBeat";

/**
 * Google-only build: the single music engine is Google Cloud Text-to-Speech
 * (spoken/rapped over an optional beat). Kept behind a small registry so more
 * engines could be added later without touching the pipeline.
 */
const PROVIDERS: Record<string, MusicProvider> = {
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

/** Resolve the provider to use. Currently always the free Google TTS engine. */
export function resolveProvider(requested?: string): MusicProvider {
  if (requested && PROVIDERS[requested]) return PROVIDERS[requested];
  return googleTtsBeat;
}
