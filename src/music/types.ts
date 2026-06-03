import type { MusicRequest } from "@/agents/schemas";

export type { MusicRequest };

export type ProviderMode = "async-webhook" | "async-poll" | "sync";

export interface ProviderCapabilities {
  /** false for instrumental-only engines. */
  sings: boolean;
  mode: ProviderMode;
  maxDurationSec: number;
  supportsSeed: boolean;
  /** how voice/gender is steered: tags (fold into styleTags), params, or none */
  voiceControl: "tags" | "params" | "none";
  estCostPerSongUsd: number;
  /** true if no external API key is required (the $0 path still needs Google TTS creds). */
  free: boolean;
}

export interface MusicSubmitResult {
  jobId: string;
}

export interface MusicResult {
  /** Provider-hosted URL (will be copied into R2 by post-process). */
  audioUrl?: string;
  /** Or a key already written to our R2 bucket (sync providers do this). */
  r2Key?: string;
  contentType?: string;
  durationSec?: number;
  raw?: unknown;
}

export interface MusicPollResult {
  status: "pending" | "done" | "error";
  result?: MusicResult;
  error?: string;
}

export interface ParsedWebhook {
  jobId: string;
  audioUrl?: string;
  error?: string;
  done: boolean;
}

export interface MusicProvider {
  id: string;
  capabilities: ProviderCapabilities;

  /** Async providers: submit a job and (for webhook mode) register a callback. */
  submit?(req: MusicRequest, opts: { webhookUrl?: string }): Promise<MusicSubmitResult>;
  /** Async-poll providers (and a fallback for webhook providers). */
  poll?(jobId: string): Promise<MusicPollResult>;
  /** Parse a provider webhook body into a normalized shape. */
  parseWebhook?(body: unknown, headers?: Record<string, string>): ParsedWebhook;

  /** Sync providers (e.g. Google TTS + ffmpeg): render fully and return audio. */
  render?(req: MusicRequest, ctx: { jobId: string }): Promise<MusicResult>;
}
