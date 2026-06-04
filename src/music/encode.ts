import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";
import { wavEncode } from "./audio";

/**
 * Final-mix encoding. We prefer MP3 (≈6–8× smaller than 16-bit WAV, which
 * matters a lot because audio is stored as chunked base64 in Firestore), but
 * fall back to WAV whenever ffmpeg isn't available or errors — so song
 * generation never fails just because the codec couldn't run.
 *
 * The MP3 transcode uses the `ffmpeg-static` binary (already bundled for the
 * pipeline route in next.config) via stdin→stdout, so it needs no temp files.
 */

export interface EncodedAudio {
  buffer: Buffer;
  contentType: string;
  /** File extension without the dot, e.g. "mp3" | "wav". */
  ext: string;
}

const MP3_BITRATE = "96k";

function wavToMp3(wav: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const bin = ffmpegPath as unknown as string | null;
    // The binary is downloaded by ffmpeg-static's postinstall; if that was
    // skipped (e.g. offline install) the path resolves but the file is absent.
    if (!bin || !existsSync(bin)) {
      return reject(new Error("ffmpeg binary not present"));
    }

    const ff = spawn(bin, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-c:a",
      "libmp3lame",
      "-b:a",
      MP3_BITRATE,
      "-ac",
      "1",
      "-f",
      "mp3",
      "pipe:1",
    ]);

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    ff.stdout.on("data", (d: Buffer) => out.push(d));
    ff.stderr.on("data", (d: Buffer) => err.push(d));
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0 && out.length) resolve(Buffer.concat(out));
      else reject(new Error(`ffmpeg exited ${code}: ${Buffer.concat(err).toString().slice(0, 500)}`));
    });
    // Ignore EPIPE if ffmpeg dies before consuming all input.
    ff.stdin.on("error", () => {});
    ff.stdin.write(wav);
    ff.stdin.end();
  });
}

/** Encode 16-bit mono PCM to MP3 (preferred) or WAV (fallback). */
export async function encodeFinal(pcm: Int16Array, sampleRate: number): Promise<EncodedAudio> {
  const wav = wavEncode(pcm, sampleRate);
  try {
    const mp3 = await wavToMp3(wav);
    if (mp3.length > 0) return { buffer: mp3, contentType: "audio/mpeg", ext: "mp3" };
  } catch (e) {
    console.warn("[encode] MP3 transcode unavailable, storing WAV:", (e as Error).message);
  }
  return { buffer: wav, contentType: "audio/wav", ext: "wav" };
}
