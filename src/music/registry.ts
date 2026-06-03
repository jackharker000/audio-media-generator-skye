import { env } from "@/lib/env";
import type { MusicProvider } from "./types";
import { falAceStep } from "./providers/falAceStep";
import { falMinimax } from "./providers/falMinimax";
import { sonauto } from "./providers/sonauto";
import { googleTtsBeat } from "./providers/googleTtsBeat";

const PROVIDERS: Record<string, MusicProvider> = {
  [falAceStep.id]: falAceStep,
  [falMinimax.id]: falMinimax,
  [sonauto.id]: sonauto,
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

/**
 * Ordered list of providers to try: the requested/default one first, then the
 * configured fallback chain (deduped). The free TTS path is typically last.
 */
export function resolveProviderChain(requested?: string): MusicProvider[] {
  const order: string[] = [];
  if (requested) order.push(requested);
  order.push(env.musicProvider());
  order.push(...env.musicFallbackChain());

  const seen = new Set<string>();
  const chain: MusicProvider[] = [];
  for (const id of order) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const p = PROVIDERS[id];
    if (p) chain.push(p);
  }
  return chain.length ? chain : [falAceStep];
}
