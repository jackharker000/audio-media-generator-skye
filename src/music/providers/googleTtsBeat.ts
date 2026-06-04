import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { features } from "@/lib/env";
import { getGoogleClientOptions } from "@/lib/googleCreds";
import { putObject } from "@/storage";
import type { MusicProvider, MusicRequest, MusicResult } from "../types";

/**
 * The Google-only music engine. Google Cloud Text-to-Speech (free tier ~1M
 * chars/month) speaks/raps the lyrics, optionally mixed over a royalty-free
 * beat with ffmpeg. Not true singing, but fully free and maximally intelligible
 * for a memorization tool. Runs synchronously — no webhooks.
 */

function stripStructureTags(lyrics: string): string {
  return lyrics
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^\[[^\]]+\]$/.test(l))
    .join("\n");
}

function ssmlGender(req: MusicRequest): "FEMALE" | "MALE" | "NEUTRAL" {
  switch (req.voice?.gender) {
    case "male":
      return "MALE";
    case "neutral":
      return "NEUTRAL";
    default:
      return "FEMALE";
  }
}

async function synthesize(text: string, req: MusicRequest): Promise<Buffer> {
  const { TextToSpeechClient } = await import("@google-cloud/text-to-speech");
  const client = new TextToSpeechClient(getGoogleClientOptions());
  const speakingRate = req.voice?.style === "rap" ? 1.15 : 1.0;
  const [resp] = await client.synthesizeSpeech({
    input: { text },
    voice: { languageCode: "en-US", ssmlGender: ssmlGender(req) },
    audioConfig: { audioEncoding: "MP3", speakingRate, pitch: 0 },
  } as any);
  const content = resp.audioContent;
  if (!content) throw new Error("Google TTS returned no audio");
  return Buffer.from(content as Uint8Array);
}

/** Look for an optional royalty-free beat for this genre under public/beats. */
async function findBeat(genre?: string): Promise<string | null> {
  const dir = path.join(process.cwd(), "public", "beats");
  const candidates = [
    genre && `${genre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.mp3`,
    "default.mp3",
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    const p = path.join(dir, c);
    try {
      await fs.access(p);
      return p;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

async function mixSpeechOverBeat(speech: Buffer, beatPath: string): Promise<Buffer> {
  const ffmpegStatic = (await import("ffmpeg-static")).default as unknown as string;
  const ffmpegMod = await import("fluent-ffmpeg");
  const ffmpeg = (ffmpegMod.default ?? ffmpegMod) as any;
  if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic);

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "mnemo-"));
  const speechPath = path.join(tmp, "speech.mp3");
  const outPath = path.join(tmp, "out.mp3");
  await fs.writeFile(speechPath, speech);

  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(beatPath)
      .inputOptions(["-stream_loop", "-1"]) // loop the beat
      .input(speechPath)
      .complexFilter([
        "[0:a]volume=0.30[bg]", // duck the beat under the voice
        "[1:a]volume=1.6[vo]",
        "[bg][vo]amix=inputs=2:duration=shortest:dropout_transition=0[mix]",
      ])
      .outputOptions(["-map", "[mix]"])
      .audioCodec("libmp3lame")
      .format("mp3")
      .on("end", () => resolve())
      .on("error", (e: Error) => reject(e))
      .save(outPath);
  });

  const out = await fs.readFile(outPath);
  await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  return out;
}

export const googleTtsBeat: MusicProvider = {
  id: "google-tts-beat",
  capabilities: {
    sings: false,
    mode: "sync",
    maxDurationSec: 240,
    supportsSeed: false,
    voiceControl: "params",
    estCostPerSongUsd: 0,
    free: true,
  },

  async render(req, { jobId }): Promise<MusicResult> {
    if (!features.hasTts()) {
      throw new Error(
        "No Google service account configured — the Google TTS music engine can't run.",
      );
    }
    const text = stripStructureTags(req.lyrics);
    const speech = await synthesize(text, req);

    let audio = speech;
    const beat = await findBeat(req.genre);
    if (beat) {
      try {
        audio = await mixSpeechOverBeat(speech, beat);
      } catch {
        audio = speech; // ffmpeg unavailable (e.g. some serverless) → speech only
      }
    }

    const key = `songs/${jobId}.mp3`;
    await putObject(key, audio, "audio/mpeg");
    return { storageKey: key, contentType: "audio/mpeg" };
  },
};
