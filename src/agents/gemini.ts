import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env } from "@/lib/env";
import { sleep } from "@/lib/utils";

/**
 * Thin Gemini wrapper used by every text stage. Free-tier friendly:
 *  - model tiering ("flash" for reasoning, "flash-lite" for bulk),
 *  - JSON output validated against a Zod schema (version-agnostic: we parse the
 *    returned text rather than relying on a specific responseSchema dialect),
 *  - retry with backoff on 429 / 5xx and one self-correcting retry on a schema
 *    validation failure.
 */

export type GeminiModel = "flash" | "flash-lite";

const MODEL_IDS: Record<GeminiModel, string> = {
  flash: "gemini-2.5-flash",
  "flash-lite": "gemini-2.5-flash-lite",
};

let _ai: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  const apiKey = env.geminiApiKey();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set — the text pipeline can't run.");
  _ai ??= new GoogleGenAI({ apiKey });
  return _ai;
}

function isRetryable(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate") ||
    msg.includes("503") ||
    msg.includes("500") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded")
  );
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
  const maxRetries = opts.maxRetries ?? 4;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const response = await ai().models.generateContent({
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
      attempt++;
      if (attempt > maxRetries || !isRetryable(err)) throw err;
      const backoff = Math.min(2000 * 2 ** (attempt - 1), 30_000);
      await sleep(backoff + Math.random() * 500);
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
  return body.slice(start).trim();
}

export async function generateJson<T>(opts: {
  model?: GeminiModel;
  system?: string;
  prompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
  maxOutputTokens?: number;
  parts?: ContentPart[];
}): Promise<T> {
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

  const tryParse = (s: string): T => opts.schema.parse(JSON.parse(extractJson(s)));

  try {
    return tryParse(raw);
  } catch (firstErr) {
    // One self-correcting retry: show the model its mistake.
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
