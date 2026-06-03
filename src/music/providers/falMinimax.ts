import { optionalEnv } from "@/lib/env";
import type { MusicProvider } from "../types";
import { getFal, mapFalStatus } from "./falClient";

const MODEL = "fal-ai/minimax-music";

function audioUrlFrom(data: unknown): string | undefined {
  const d = data as any;
  return d?.audio?.url ?? d?.output?.url;
}

/**
 * MiniMax Music via fal.ai — optional, higher-quality vocals (~3¢/gen).
 * Note: MiniMax is reference/cover oriented; supply a per-genre royalty-free
 * reference bed via MINIMAX_REFERENCE_AUDIO_URL for best results.
 */
export const falMinimax: MusicProvider = {
  id: "fal-minimax",
  capabilities: {
    sings: true,
    mode: "async-webhook",
    maxDurationSec: 90,
    supportsSeed: false,
    voiceControl: "tags",
    estCostPerSongUsd: 0.03,
    free: false,
  },

  async submit(req, { webhookUrl }) {
    const fal = await getFal();
    const input: Record<string, unknown> = {
      prompt: req.styleTags,
      lyrics: req.lyrics,
    };
    const ref = optionalEnv("MINIMAX_REFERENCE_AUDIO_URL");
    if (ref) input.reference_audio_url = ref;

    const { request_id } = await fal.queue.submit(MODEL, { input: input as any, webhookUrl });
    return { jobId: request_id };
  },

  async poll(jobId) {
    const fal = await getFal();
    const status = await fal.queue.status(MODEL, { requestId: jobId, logs: false });
    const mapped = mapFalStatus(status.status);
    if (mapped === "done") {
      const res = await fal.queue.result(MODEL, { requestId: jobId });
      return { status: "done", result: { audioUrl: audioUrlFrom(res.data), raw: res.data } };
    }
    if (mapped === "pending") return { status: "pending" };
    return { status: "error", error: JSON.stringify(status) };
  },

  parseWebhook(body) {
    const b = body as any;
    const jobId = b.request_id ?? b.requestId ?? "";
    if (b.status === "ERROR" || b.error) return { jobId, error: JSON.stringify(b.error ?? b), done: true };
    return { jobId, audioUrl: audioUrlFrom(b.payload) ?? audioUrlFrom(b), done: true };
  },
};
