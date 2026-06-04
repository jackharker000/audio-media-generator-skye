import { getServiceAccount, getStorageBucket } from "./googleCreds";

/**
 * Hard-coded production site URL (Vercel). Used as the default for absolute
 * links and the Auth.js callback base so OAuth redirects stay stable across
 * deploys. Override with APP_URL / AUTH_URL if you use a different domain.
 */
export const DEFAULT_SITE_URL = "https://audio-media-generator-skye.vercel.app";

/**
 * Centralized, lazy environment access. Nothing throws at import time so the
 * app can build and run with only a subset of services configured.
 */

export function optionalEnv(key: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}

export function requireEnv(key: string): string {
  const v = optionalEnv(key);
  if (!v) throw new Error(`Missing required environment variable: ${key}`);
  return v;
}

export function intEnv(key: string, fallback: number): number {
  const v = optionalEnv(key);
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  appUrl: () =>
    optionalEnv("APP_URL") ??
    optionalEnv("NEXT_PUBLIC_APP_URL") ??
    (process.env.NODE_ENV === "production" ? DEFAULT_SITE_URL : "http://localhost:3000"),
  geminiApiKey: () => optionalEnv("GEMINI_API_KEY"),
  musicProvider: () => optionalEnv("MUSIC_PROVIDER") ?? "gemini-tts",
  storageBucket: () => getStorageBucket(),
  maxRewrites: () => intEnv("PIPELINE_MAX_REWRITES", 2),
  quotaSongsPerDay: () => intEnv("QUOTA_SONGS_PER_DAY", 20),
};

/** Feature flags derived from which Google credentials are present. */
export const features = {
  /** Firestore (our database) — needs a Google service account. */
  hasDb: () => !!getServiceAccount(),
  hasFirebase: () => !!getServiceAccount(),
  hasGemini: () => !!optionalEnv("GEMINI_API_KEY"),
  /** Google Cloud Text-to-Speech (the music engine) uses the same SA. */
  hasTts: () => !!getServiceAccount(),
  /** Cloud Storage needs the SA and a bucket name. */
  hasCloudStorage: () => !!getServiceAccount() && !!getStorageBucket(),
};
