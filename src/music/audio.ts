/** Pure-JS audio helpers (no ffmpeg / native deps). 16-bit mono PCM + WAV. */

export function int16ToFloat(pcm: Int16Array): Float32Array {
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] / 32768;
  return out;
}

export function floatToInt16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    out[i] = Math.round(s < 0 ? s * 32768 : s * 32767);
  }
  return out;
}

/** Decode little-endian 16-bit PCM from a Buffer (copy — alignment-safe). */
export function bufferToInt16LE(buf: Buffer): Int16Array {
  const n = Math.floor(buf.length / 2);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(i * 2);
  return out;
}

export function wavEncode(pcm: Int16Array, sampleRate: number, channels = 1): Buffer {
  const dataSize = pcm.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * 2, 28);
  buf.writeUInt16LE(channels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < pcm.length; i++) buf.writeInt16LE(pcm[i], 44 + i * 2);
  return buf;
}

export interface DecodedWav {
  pcm: Int16Array;
  sampleRate: number;
  channels: number;
}

export function wavDecode(buf: Buffer): DecodedWav {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Not a WAV file");
  }
  let sampleRate = 24000;
  let channels = 1;
  let bits = 16;
  let dataOffset = -1;
  let dataLen = 0;
  let p = 12;
  while (p + 8 <= buf.length) {
    const id = buf.toString("ascii", p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(p + 10);
      sampleRate = buf.readUInt32LE(p + 12);
      bits = buf.readUInt16LE(p + 22);
    } else if (id === "data") {
      dataOffset = p + 8;
      dataLen = size;
    }
    p += 8 + size + (size % 2);
  }
  if (dataOffset < 0) throw new Error("WAV has no data chunk");
  if (bits !== 16) throw new Error("Only 16-bit WAV supported");
  const n = Math.floor(Math.min(dataLen, buf.length - dataOffset) / 2);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) pcm[i] = buf.readInt16LE(dataOffset + i * 2);
  return { pcm, sampleRate, channels };
}

export function downmixToMonoFloat(pcm: Int16Array, channels: number): Float32Array {
  if (channels <= 1) return int16ToFloat(pcm);
  const frames = Math.floor(pcm.length / channels);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < channels; c++) s += pcm[i * channels + c];
    out[i] = s / channels / 32768;
  }
  return out;
}

export function resampleMono(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;
  const ratio = toRate / fromRate;
  const outLen = Math.max(1, Math.floor(input.length * ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i / ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    out[i] = input[i0] * (1 - (src - i0)) + input[i1] * (src - i0);
  }
  return out;
}

/** Normalize peak amplitude to `target` (in place) to avoid clipping. */
export function normalize(buf: Float32Array, target = 0.97): Float32Array {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]));
  if (peak > target && peak > 0) {
    const g = target / peak;
    for (let i = 0; i < buf.length; i++) buf[i] *= g;
  }
  return buf;
}
