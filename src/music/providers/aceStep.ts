import { optionalEnv } from "@/lib/env";
import { putObject } from "@/storage";
import { sleep } from "@/lib/utils";
import type { MusicProvider, MusicRequest, MusicResult } from "../types";

/**
 * ACE-Step — open-source model that actually SINGS with full production.
 * It needs a GPU host, so this provider supports three backends (pick via
 * ACESTEP_BACKEND, or it auto-detects from which env vars are set):
 *   - "acemusic": the hosted ACE Music API (https://api.acemusic.ai) — free key.
 *   - "local":    a self-hosted ACE-Step api_server (ACESTEP_LOCAL_URL).
 *   - "hf":       a Hugging Face Gradio Space (experimental).
 * If it fails, the pipeline falls back to the built-in `gemini-song` engine.
 */

type Backend = "acemusic" | "local" | "hf";

function backend(): Backend {
  const b = optionalEnv("ACESTEP_BACKEND");
  if (b === "acemusic" || b === "local" || b === "hf") return b;
  if (optionalEnv("ACESTEP_LOCAL_URL")) return "local";
  if (optionalEnv("ACESTEP_HF_SPACE")) return "hf";
  return "acemusic";
}

function styleFor(req: MusicRequest): string {
  return req.styleTags?.trim() || `${req.genre ?? "pop"}, clear vocals, catchy`;
}

function authHeaders(apiKey?: string): Record<string, string> {
  if (!apiKey) return {};
  // ACE-Step's api_server / ACE Music accept the key; send common header forms.
  return { Authorization: `Bearer ${apiKey}`, "x-api-key": apiKey, "api-key": apiKey };
}

async function storeAudio(jobId: string, buf: Buffer, contentType: string): Promise<MusicResult> {
  const ext = contentType.includes("wav") ? "wav" : contentType.includes("flac") ? "flac" : "mp3";
  const key = `songs/${jobId}.${ext}`;
  await putObject(key, buf, contentType);
  return { storageKey: key, contentType };
}

/** Defensively pull the result entry for a task id out of /query_result. */
function extractEntry(json: any, taskId: string): any {
  const d = json?.data ?? json;
  if (Array.isArray(d)) return d.find((x) => x?.task_id === taskId || x?.taskId === taskId) ?? d[0];
  if (d && typeof d === "object") return d[taskId] ?? d.result ?? d;
  return d;
}

/**
 * ACE-Step api_server protocol — used by BOTH the hosted ACE Music API and a
 * self-hosted server: POST /release_task → poll /query_result → GET the audio.
 */
async function renderApiServer(
  req: MusicRequest,
  jobId: string,
  base: string,
  apiKey?: string,
): Promise<MusicResult> {
  const root = base.replace(/\/$/, "");
  const headers = { "Content-Type": "application/json", ...authHeaders(apiKey) };
  const genPath = optionalEnv("ACESTEP_GENERATE_PATH") ?? "/release_task";
  const queryPath = optionalEnv("ACESTEP_QUERY_PATH") ?? "/query_result";

  const submitRes = await fetch(root + genPath, {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt: styleFor(req),
      caption: styleFor(req),
      lyrics: req.lyrics,
      audio_duration: Math.min(600, Math.max(10, req.durationSec)),
      audio_format: "mp3",
      ...(req.seed != null ? { seed: req.seed } : {}),
    }),
  });
  if (!submitRes.ok) {
    throw new Error(`ACE-Step submit ${submitRes.status}: ${(await submitRes.text()).slice(0, 200)}`);
  }
  const submitJson = await submitRes.json();
  const taskId =
    submitJson?.data?.task_id ?? submitJson?.task_id ?? submitJson?.data?.taskId ?? submitJson?.id;
  if (!taskId) throw new Error("ACE-Step: no task_id in response");

  let fileRef: string | undefined;
  for (let i = 0; i < 100; i++) {
    await sleep(3000);
    const qRes = await fetch(root + queryPath, {
      method: "POST",
      headers,
      body: JSON.stringify({ task_ids: [taskId], task_id: taskId }),
    });
    if (!qRes.ok) continue;
    const entry = extractEntry(await qRes.json(), taskId);
    const status = entry?.status;
    fileRef = entry?.file ?? entry?.audio ?? entry?.url ?? entry?.audio_url;
    if (fileRef) break;
    if (status === 2 || status === "failed" || status === "error") {
      throw new Error(`ACE-Step generation failed: ${JSON.stringify(entry).slice(0, 200)}`);
    }
  }
  if (!fileRef) throw new Error("ACE-Step timed out waiting for audio");

  const audioUrl = fileRef.startsWith("http")
    ? fileRef
    : root + (fileRef.startsWith("/") ? "" : "/") + fileRef;
  const audioRes = await fetch(audioUrl, { headers: authHeaders(apiKey) });
  if (!audioRes.ok) throw new Error(`ACE-Step audio download ${audioRes.status}`);
  const buf = Buffer.from(await audioRes.arrayBuffer());
  return storeAudio(jobId, buf, audioRes.headers.get("content-type") ?? "audio/mpeg");
}

/** Find the first audio URL anywhere in a Gradio result payload. */
function findAudioUrl(data: unknown): string | undefined {
  const exts = [".wav", ".mp3", ".flac", ".ogg", ".m4a"];
  const seen = new Set<unknown>();
  const stack: unknown[] = [data];
  while (stack.length) {
    const x = stack.pop();
    if (!x || seen.has(x)) continue;
    if (typeof x === "string") {
      if (x.startsWith("http") && exts.some((e) => x.toLowerCase().includes(e))) return x;
      continue;
    }
    if (typeof x === "object") {
      seen.add(x);
      const anyx = x as Record<string, unknown>;
      if (typeof anyx.url === "string" && anyx.url.startsWith("http")) return anyx.url;
      for (const k in anyx) stack.push(anyx[k]);
    }
  }
  return undefined;
}

/** Hugging Face Gradio Space (experimental — input signature varies by Space). */
async function renderHf(req: MusicRequest, jobId: string): Promise<MusicResult> {
  const space = optionalEnv("ACESTEP_HF_SPACE") ?? "ace-step/ACE-Step";
  const token = optionalEnv("HF_TOKEN");
  const { Client } = await import("@gradio/client");
  const app = await Client.connect(space, token ? ({ hf_token: token } as any) : undefined);
  const endpoint = optionalEnv("ACESTEP_HF_API") ?? "/__call__";
  const result: any = await app.predict(endpoint, {
    tags: styleFor(req),
    prompt: styleFor(req),
    lyrics: req.lyrics,
    audio_duration: Math.min(240, Math.max(10, req.durationSec)),
    duration: Math.min(240, Math.max(10, req.durationSec)),
  } as any);
  const url = findAudioUrl(result?.data);
  if (!url) throw new Error("ACE-Step (HF) returned no audio");
  const audioRes = await fetch(url);
  if (!audioRes.ok) throw new Error(`ACE-Step (HF) download ${audioRes.status}`);
  const buf = Buffer.from(await audioRes.arrayBuffer());
  return storeAudio(jobId, buf, audioRes.headers.get("content-type") ?? "audio/wav");
}

export const aceStep: MusicProvider = {
  id: "ace-step",
  capabilities: {
    sings: true,
    mode: "sync",
    maxDurationSec: 240,
    supportsSeed: true,
    voiceControl: "tags",
    estCostPerSongUsd: 0,
    free: true,
  },

  async render(req, { jobId }): Promise<MusicResult> {
    const b = backend();
    if (b === "hf") return renderHf(req, jobId);
    if (b === "local") {
      const base = optionalEnv("ACESTEP_LOCAL_URL");
      if (!base) throw new Error("ACESTEP_LOCAL_URL not set for local ACE-Step backend");
      return renderApiServer(req, jobId, base, optionalEnv("ACESTEP_LOCAL_API_KEY"));
    }
    const base = optionalEnv("ACEMUSIC_API_URL") ?? "https://api.acemusic.ai";
    const key = optionalEnv("ACEMUSIC_API_KEY");
    if (!key) throw new Error("ACEMUSIC_API_KEY not set (get one at acemusic.ai/playground/api-key)");
    return renderApiServer(req, jobId, base, key);
  },
};
