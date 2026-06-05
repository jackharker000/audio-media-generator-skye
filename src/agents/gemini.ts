import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env, optionalEnv } from "@/lib/env";
import { sleep } from "@/lib/utils";

/**
 * Gemini wrapper used by every text stage. Free-tier friendly:
 *  - **Key rotation**: every env var containing "API_KEY" is a candidate key
 *    (from different Google projects, each with its own free quota). Calls
 *    round-robin across keys and fail over instantly when one is rate-limited;
 *    keys that report as invalid are dropped for the process.
 *  - Defaults to Flash-Lite (cheaper, higher free quota); override via GEMINI_MODEL*.
 *  - JSON validated against a Zod schema, with one self-correcting retry.
 */

export type GeminiModel = "flash" | "flash-lite";

const DEFAULT_MODEL = optionalEnv("GEMINI_MODEL") ?? "gemini-2.5-flash-lite";
const MODEL_IDS: Record<GeminiModel, string> = {
  flash: optionalEnv("GEMINI_MODEL_FLASH") ?? DEFAULT_MODEL,
  "flash-lite": optionalEnv("GEMINI_MODEL_FLASH_LITE") ?? DEFAULT_MODEL,
};

// ---- key rotation ---------------------------------------------------------

const clients = new Map<string, GoogleGenAI>();
const cooldownUntil = new Map<string, number>(); // key -> epoch ms usable again
const invalidKeys = new Set<string>(); // keys that returned "invalid" this process
let rrCursor = 0;

function clientFor(key: string): GoogleGenAI {
  let c = clients.get(key);
  if (!c) {
    c = new GoogleGenAI({ apiKey: key });
    clients.set(key, c);
  }
  return c;
}

/** Next usable key (round-robin), skipping invalid/cooling keys, or null. */
function pickKey(keys: string[]): string | null {
  const now = Date.now();
  for (let i = 0; i < keys.length; i++) {
    const k = keys[(rrCursor + i) % keys.length];
    if (invalidKeys.has(k)) continue;
    if ((cooldownUntil.get(k) ?? 0) <= now) {
      rrCursor = (rrCursor + i + 1) % keys.length;
      return k;
    }
  }
  return null;
}

function soonestAvailable(keys: string[]): number {
  const valid = keys.filter((k) => !invalidKeys.has(k));
  return valid.length ? Math.min(...valid.map((k) => cooldownUntil.get(k) ?? 0)) : Date.now();
}

function isRetryable(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota") ||
    msg.includes("rate") ||
    msg.includes("503") ||
    msg.includes("500") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded")
  );
}

function isInvalidKey(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("api key not valid") ||
    msg.includes("api_key_invalid") ||
    msg.includes("invalid api key") ||
    (msg.includes("400") && msg.includes("api key"))
  );
}

function parseRetryDelaySec(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = /retryDelay"?\s*[:=]\s*"?(\d+(?:\.\d+)?)s/i.exec(msg);
  return m ? Math.ceil(parseFloat(m[1])) : null;
}

type ContentPart = { text: string } | { inlineData: { mimeType: string; data: string } };

async function callModel(opts: {
  model: GeminiModel;
  system?: string;
  parts: ContentPart[];
  temperature?: number;
  json?: boolean;
  maxOutputTokens?: number;
  maxRetries?: number;
}): Promise<string> {
  const keys = env.geminiKeys();
  if (keys.length === 0) throw new Error("No Gemini API key configured (set GEMINI_API_KEY).");
  const maxRetries = opts.maxRetries ?? Math.max(6, keys.length * 2);
  let attempt = 0;
  let lastErr: unknown;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (keys.every((k) => invalidKeys.has(k))) {
      throw lastErr ?? new Error("All configured Gemini API keys are invalid.");
    }

    let key = pickKey(keys);
    if (!key) {
      const waitMs = Math.min(Math.max(soonestAvailable(keys) - Date.now(), 800), 60_000);
      await sleep(waitMs + Math.random() * 300);
      key = pickKey(keys);
      if (!key) {
        // Every key is still cooling. Count the wait against the retry budget so
        // a sustained 429 storm can't spin here indefinitely past maxRetries.
        if (++attempt > maxRetries) {
          throw lastErr ?? new Error("All Gemini API keys are rate-limited; try again shortly.");
        }
        continue;
      }
    }

    try {
      const response = await clientFor(key).models.generateContent({
        model: MODEL_IDS[opts.model],
        contents: [{ role: "user", parts: opts.parts as any }],
        config: {
          systemInstruction: opts.system,
          temperature: opts.temperature ?? 0.8,
          responseMimeType: opts.json ? "application/json" : undefined,
          maxOutputTokens: opts.maxOutputTokens,
        },
      });
      const text = response.text ?? "";
      if (!text) throw new Error("Empty response from Gemini");
      return text;
    } catch (err) {
      lastErr = err;
      attempt++;
      if (isInvalidKey(err)) {
        invalidKeys.add(key); // drop this key and try another
        continue;
      }
      if (!isRetryable(err)) throw err;
      const delaySec = parseRetryDelaySec(err) ?? Math.min(2 ** attempt, 30);
      cooldownUntil.set(key, Date.now() + delaySec * 1000);
      if (attempt > maxRetries) throw err;
    }
  }
}

/** Pull the first balanced JSON object/array out of a model response. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  if (start === -1) return body.trim();
  const open = body[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return body.slice(start, i + 1);
    }
  }
  // Reached the end with an open structure: the JSON was truncated (commonly a
  // token-limit cutoff). Fail clearly instead of returning a partial fragment.
  throw new Error("Truncated or unbalanced JSON in model response (raise maxOutputTokens).");
}

export async function generateJson<S extends z.ZodTypeAny>(opts: {
  model?: GeminiModel;
  system?: string;
  prompt: string;
  schema: S;
  temperature?: number;
  maxOutputTokens?: number;
  parts?: ContentPart[];
}): Promise<z.infer<S>> {
  const model = opts.model ?? "flash";
  const baseParts: ContentPart[] = opts.parts ?? [];
  const parts: ContentPart[] = [...baseParts, { text: opts.prompt }];

  const raw = await callModel({
    model,
    system: opts.system,
    parts,
    temperature: opts.temperature ?? 0.7,
    json: true,
    maxOutputTokens: opts.maxOutputTokens,
  });

  const tryParse = (s: string): z.infer<S> => opts.schema.parse(JSON.parse(extractJson(s)));

  try {
    return tryParse(raw);
  } catch (firstErr) {
    try {
      const fix = await callModel({
        model,
        system: opts.system,
        parts: [
          ...parts,
          {
            text:
              "Your previous response was invalid JSON or failed schema validation:\n" +
              String(firstErr) +
              "\nReturn ONLY corrected, valid JSON. No prose, no markdown fences.",
          },
        ],
        temperature: 0.2,
        json: true,
        maxOutputTokens: opts.maxOutputTokens,
      });
      return tryParse(fix);
    } catch (secondErr) {
      // Keep the original schema/parse failure visible — the retry may have hit
      // an unrelated transient error (e.g. 429) that would otherwise mask it.
      throw new Error(`Gemini JSON invalid after retry — first: ${String(firstErr)}; retry: ${String(secondErr)}`);
    }
  }
}

export async function generateText(opts: {
  model?: GeminiModel;
  system?: string;
  prompt: string;
  parts?: ContentPart[];
  temperature?: number;
}): Promise<string> {
  const parts: ContentPart[] = [...(opts.parts ?? []), { text: opts.prompt }];
  return callModel({
    model: opts.model ?? "flash",
    system: opts.system,
    parts,
    temperature: opts.temperature ?? 0.4,
    json: false,
  });
}

export type { ContentPart };
