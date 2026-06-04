import { extractDocument } from "@/extract";
import { getObjectBuffer } from "@/storage";
import { estimateTokens, stableHash } from "@/lib/utils";
import * as store from "@/pipeline/jobStore";
import type { DbSourceDocument } from "@/db/types";

export interface ExtractedBundle {
  normalizedText: string;
  sourceHash: string;
  warnings: string[];
}

/**
 * Stage 2 — local-first extraction. Pasted sources already carry text; uploads
 * are fetched from storage and parsed deterministically (no LLM tokens spent).
 */
export async function extractSources(sources: DbSourceDocument[]): Promise<ExtractedBundle> {
  const parts: string[] = [];
  const warnings: string[] = [];

  for (const s of sources) {
    let text = s.normalizedText ?? "";
    if (!text && s.storageKey) {
      const buf = await getObjectBuffer(s.storageKey);
      const res = await extractDocument(buf, s.filename, s.mime ?? undefined);
      text = res.text;
      if (res.warnings.length) warnings.push(...res.warnings.map((w) => `${s.filename}: ${w}`));
      await store.saveSourceText(s.id, text, estimateTokens(text), res.warnings, text.length > 0);
    }
    if (text.trim()) parts.push(`# Source: ${s.filename}\n\n${text.trim()}`);
  }

  const normalizedText = parts.join("\n\n---\n\n").trim();
  if (!normalizedText) {
    throw new Error("No readable text was found in the provided sources.");
  }
  return { normalizedText, sourceHash: stableHash(normalizedText), warnings };
}
