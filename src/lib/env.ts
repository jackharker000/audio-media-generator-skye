/**
 * Centralized, lazy environment access. Nothing throws at import time so the
 * app can build and run with only a SUBSET of services configured.
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
  appUrl: () => optionalEnv("APP_URL") ?? optionalEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
  databaseUrl: () => optionalEnv("DATABASE_URL"),
  geminiApiKey: () => optionalEnv("GEMINI_API_KEY"),
  falKey: () => optionalEnv("FAL_KEY"),
  falWebhookSecret: () => optionalEnv("FAL_WEBHOOK_SECRET"),
  musicProvider: () => optionalEnv("MUSIC_PROVIDER") ?? "fal-acestep",
  musicFallbackChain: () =>
    (optionalEnv("MUSIC_FALLBACK_CHAIN") ?? "fal-acestep,google-tts-beat")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  r2: () => ({
    accountId: optionalEnv("R2_ACCOUNT_ID"),
    accessKeyId: optionalEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: optionalEnv("R2_SECRET_ACCESS_KEY"),
    bucket: optionalEnv("R2_BUCKET") ?? "mnemosong",
    publicBaseUrl: optionalEnv("R2_PUBLIC_BASE_URL"),
  }),
  maxRewrites: () => intEnv("PIPELINE_MAX_REWRITES", 2),
  quotaSongsPerDay: () => intEnv("QUOTA_SONGS_PER_DAY", 20),
};

/** Feature flags derived from which env vars are present. */
export const features = {
  hasDb: () => !!env.databaseUrl(),
  hasGemini: () => !!env.geminiApiKey(),
  hasFal: () => !!env.falKey(),
  hasR2: () => {
    const r = env.r2();
    return !!(r.accountId && r.accessKeyId && r.secretAccessKey);
  },
  hasTts: () => !!optionalEnv("GOOGLE_APPLICATION_CREDENTIALS"),
};
