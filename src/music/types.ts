import type { MusicRequest } from "@/agents/schemas";

export type { MusicRequest };

export type ProviderMode = "async-webhook" | "async-poll" | "sync";

export interface ProviderCapabilities {
  /** false for instrumental-only / non-singing engines. */
  sings: boolean;
  mode: ProviderMode;
  maxDurationSec: number;
  supportsSeed: boolean;
  voiceControl: "tags" | "params" | "none";
  estCostPerSongUsd: number;
  /** true if it needs no paid third-party API (Google free tier counts). */
  free: boolean;
}

export interface MusicResult {
  /** Provider-hosted URL (rare; would be copied into our storage). */
  audioUrl?: string;
  /** Key already written to our storage (sync providers do this). */
  storageKey?: string;
  contentType?: string;
  durationSec?: number;
  raw?: unknown;
}

export interface MusicProvider {
  id: string;
  capabilities: ProviderCapabilities;
  /** Sync providers (e.g. Google TTS + ffmpeg): render fully and return audio. */
  render?(req: MusicRequest, ctx: { jobId: string }): Promise<MusicResult>;
}
