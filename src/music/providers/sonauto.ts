import type { MusicProvider } from "../types";
import { getFal, mapFalStatus } from "./falClient";

const MODEL = "sonauto/v2/text-to-music";

function audioUrlFrom(data: unknown): string | undefined {
  const d = data as any;
  return d?.audio?.url ?? d?.songs?.[0]?.url ?? d?.output?.url;
}

/**
 * Sonauto v2 via fal.ai — optional, strong vocals (~7.5¢/gen). Accepts explicit
 * tags + lyrics; balance_strength tilts toward natural vocals.
 */
export const sonauto: MusicProvider = {
  id: "sonauto",
  capabilities: {
    sings: true,
    mode: "async-webhook",
    maxDurationSec: 240,
    supportsSeed: true,
    voiceControl: "tags",
    estCostPerSongUsd: 0.075,
    free: false,
  },

  async submit(req, { webhookUrl }) {
    const fal = await getFal();
    const input: Record<string, unknown> = {
      tags: req.styleTags.split(",").map((s) => s.trim()).filter(Boolean),
      lyrics: req.lyrics,
      balance_strength: 0.7,
      output_format: "mp3",
    };
    if (req.seed != null) input.seed = req.seed;

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
