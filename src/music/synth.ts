import { ArrangementSchema, type Arrangement } from "@/agents/schemas";
import { normalize } from "./audio";

/**
 * Renders a simple Arrangement (chords + bass + drums) to mono Float32 PCM with
 * a small additive synth. Lo-fi but real music — deterministic, pure JS.
 */

const NOTE: Record<string, number> = {
  C: 0, "C#": 1, DB: 1, D: 2, "D#": 3, EB: 3, E: 4, F: 5, "F#": 6, GB: 6,
  G: 7, "G#": 8, AB: 8, A: 9, "A#": 10, BB: 10, B: 11,
};

function noteSemitone(name: string): number {
  const k = (name || "C").trim().toUpperCase().replace("♯", "#").replace("♭", "B");
  return NOTE[k] ?? NOTE[k[0]] ?? 0;
}

const QUALITY: Record<string, number[]> = {
  maj: [0, 4, 7], major: [0, 4, 7], "": [0, 4, 7],
  min: [0, 3, 7], minor: [0, 3, 7], m: [0, 3, 7],
  maj7: [0, 4, 7, 11], major7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10], minor7: [0, 3, 7, 10], m7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10], "7": [0, 4, 7, 10], dominant7: [0, 4, 7, 10],
  dim: [0, 3, 6], sus4: [0, 5, 7], sus: [0, 5, 7], aug: [0, 4, 8],
};

function chordIntervals(quality: string): number[] {
  return QUALITY[(quality || "maj").toLowerCase()] ?? QUALITY.maj;
}

/** MIDI-style frequency from a semitone offset above C and an octave (C4=60). */
function freqFromSemis(semisAboveC: number, octave: number): number {
  const midi = 12 * (octave + 1) + semisAboveC;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Add a tone with a short attack/release envelope (additive). */
function addTone(out: Float32Array, start: number, len: number, f: number, amp: number, sr: number) {
  if (len <= 0 || f <= 0) return;
  const atk = Math.min(0.012 * sr, len * 0.25);
  const rel = Math.min(0.1 * sr, len * 0.5);
  const w = (2 * Math.PI * f) / sr;
  const end = Math.min(out.length, start + len);
  for (let i = start, n = 0; i < end; i++, n++) {
    let env = 1;
    if (n < atk) env = n / atk;
    else if (n > len - rel) env = Math.max(0, (len - n) / rel);
    // fundamental + soft 2nd harmonic for a warmer pad
    out[i] += amp * env * (Math.sin(w * n) + 0.25 * Math.sin(2 * w * n));
  }
}

function addOneShot(out: Float32Array, start: number, shot: Float32Array, amp: number) {
  const end = Math.min(out.length, start + shot.length);
  for (let i = start, n = 0; i < end; i++, n++) out[i] += shot[n] * amp;
}

function kickShot(sr: number): Float32Array {
  const len = Math.floor(0.16 * sr);
  const b = new Float32Array(len);
  for (let n = 0; n < len; n++) {
    const t = n / sr;
    const f = 110 * Math.exp(-t * 24) + 45;
    b[n] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 16);
  }
  return b;
}
function snareShot(sr: number): Float32Array {
  const len = Math.floor(0.18 * sr);
  const b = new Float32Array(len);
  for (let n = 0; n < len; n++) {
    const t = n / sr;
    const env = Math.exp(-t * 22);
    b[n] = ((Math.random() * 2 - 1) * 0.8 + Math.sin(2 * Math.PI * 180 * t) * 0.2) * env;
  }
  return b;
}
function hihatShot(sr: number): Float32Array {
  const len = Math.floor(0.05 * sr);
  const b = new Float32Array(len);
  let prev = 0;
  for (let n = 0; n < len; n++) {
    const noise = Math.random() * 2 - 1;
    const hp = noise - prev; // crude high-pass
    prev = noise;
    b[n] = hp * Math.exp(-(n / sr) * 60);
  }
  return b;
}

export function synthesizeArrangement(
  arr: Arrangement,
  durationSec: number,
  sampleRate: number,
): Float32Array {
  const sr = sampleRate;
  const N = Math.max(1, Math.floor(durationSec * sr));
  const out = new Float32Array(N);

  const bpm = Math.min(200, Math.max(50, arr.tempoBpm || 96));
  const beatSamples = (60 / bpm) * sr;
  const stepSamples = beatSamples / 4; // 16th notes
  const barSamples = beatSamples * 4;

  // Chords (pad) + bass, looping the progression.
  const prog = arr.chords.length ? arr.chords : [{ root: "C", quality: "maj", beats: 4 }];
  let cursor = 0;
  let guard = 0;
  while (cursor < N && guard++ < 100000) {
    for (const ch of prog) {
      if (cursor >= N) break;
      const lenBeats = Math.min(8, Math.max(0.5, ch.beats || 4));
      const len = Math.floor(lenBeats * beatSamples);
      const rootSemi = noteSemitone(ch.root);
      for (const off of chordIntervals(ch.quality)) {
        addTone(out, cursor, len, freqFromSemis(rootSemi + off, 4), 0.055, sr);
      }
      for (let bt = 0; bt < lenBeats; bt++) {
        addTone(out, cursor + Math.floor(bt * beatSamples), Math.floor(beatSamples * 0.9), freqFromSemis(rootSemi, 2), 0.14, sr);
      }
      cursor += len;
    }
  }

  // Drums per bar.
  const kk = kickShot(sr);
  const sn = snareShot(sr);
  const hh = hihatShot(sr);
  const clampStep = (s: number) => Math.max(0, Math.min(15, Math.round(s)));
  const bars = Math.ceil(N / barSamples);
  for (let bar = 0; bar < bars; bar++) {
    const barStart = bar * barSamples;
    for (const s of arr.drums.kick) addOneShot(out, Math.floor(barStart + clampStep(s) * stepSamples), kk, 0.9);
    for (const s of arr.drums.snare) addOneShot(out, Math.floor(barStart + clampStep(s) * stepSamples), sn, 0.6);
    for (const s of arr.drums.hihat) addOneShot(out, Math.floor(barStart + clampStep(s) * stepSamples), hh, 0.22);
  }

  return normalize(out, 0.95);
}

const BASE_DRUMS = { kick: [0, 8], snare: [4, 12], hihat: [0, 2, 4, 6, 8, 10, 12, 14] };

const TEMPLATES: Record<string, Partial<Arrangement>> = {
  "lo-fi": {
    tempoBpm: 78,
    chords: [
      { root: "C", quality: "maj7", beats: 4 }, { root: "A", quality: "min7", beats: 4 },
      { root: "D", quality: "min7", beats: 4 }, { root: "G", quality: "dom7", beats: 4 },
    ],
  },
  "hip-hop": {
    tempoBpm: 90,
    drums: { kick: [0, 6, 10], snare: [4, 12], hihat: [0, 2, 4, 6, 8, 10, 12, 14] },
    chords: [
      { root: "A", quality: "min", beats: 4 }, { root: "F", quality: "maj", beats: 4 },
      { root: "C", quality: "maj", beats: 4 }, { root: "G", quality: "maj", beats: 4 },
    ],
  },
  rock: {
    tempoBpm: 120,
    chords: [
      { root: "E", quality: "maj", beats: 4 }, { root: "A", quality: "maj", beats: 4 },
      { root: "B", quality: "maj", beats: 4 }, { root: "A", quality: "maj", beats: 4 },
    ],
  },
  edm: {
    tempoBpm: 126,
    chords: [
      { root: "F", quality: "min", beats: 4 }, { root: "Ab", quality: "maj", beats: 4 },
      { root: "Eb", quality: "maj", beats: 4 }, { root: "Bb", quality: "maj", beats: 4 },
    ],
  },
  ballad: {
    tempoBpm: 72,
    chords: [
      { root: "C", quality: "maj", beats: 4 }, { root: "G", quality: "maj", beats: 4 },
      { root: "A", quality: "min", beats: 4 }, { root: "F", quality: "maj", beats: 4 },
    ],
  },
  pop: {
    tempoBpm: 104,
    chords: [
      { root: "C", quality: "maj", beats: 4 }, { root: "G", quality: "maj", beats: 4 },
      { root: "A", quality: "min", beats: 4 }, { root: "F", quality: "maj", beats: 4 },
    ],
  },
};

/** Fallback arrangement (per genre) when Gemini didn't supply one. */
export function defaultArrangement(genre?: string, tempoHint?: number): Arrangement {
  const g = (genre ?? "pop").toLowerCase();
  const t = TEMPLATES[g] ?? TEMPLATES.pop;
  return ArrangementSchema.parse({
    key: "C major",
    tempoBpm: tempoHint ?? t.tempoBpm ?? 104,
    chords: t.chords,
    drums: t.drums ?? BASE_DRUMS,
    feel: g,
  });
}
