import type { MusicProvider } from "../types";
import { getFal, mapFalStatus } from "./falClient";

const MODEL = "fal-ai/ace-step";

function audioUrlFrom(data: unknown): string | undefined {
  const d = data as any;
  return d?.audio?.url ?? d?.audio_file?.url ?? d?.output?.url;
}

/**
 * ACE-Step (Apache-2.0 open song model) via fal.ai — the primary engine.
 * Cheap (~1-3¢/song), sings lyrics from (tags + lyrics).
 */
export const falAceStep: MusicProvider = {
  id: "fal-acestep",
  capabilities: {
    sings: true,
    mode: "async-webhook",
    maxDurationSec: 240,
    supportsSeed: true,
    voiceControl: "tags",
    estCostPerSongUsd: 0.02,
    free: false,
  },

  async submit(req, { webhookUrl }) {
    const fal = await getFal();
    const input: Record<string, unknown> = {
      tags: req.styleTags,
      lyrics: req.lyrics,
      duration: Math.min(req.durationSec, 240),
    };
    if (req.seed != null) input.seed = req.seed;
    if (req.steps != null) input.number_of_steps = req.steps;

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
    if (b.status === "ERROR" || b.error) {
      return { jobId, error: JSON.stringify(b.error ?? b.payload ?? b), done: true };
    }
    const audioUrl = audioUrlFrom(b.payload) ?? audioUrlFrom(b);
    return { jobId, audioUrl, done: true };
  },
};
