import { estimateTokens } from "@/lib/utils";

export interface Chunk {
  index: number;
  text: string;
  tokenEstimate: number;
}

/**
 * Token-aware chunking for the map step. Splits on paragraph boundaries and
 * accumulates up to ~maxTokens per chunk with a small overlap, so each chunk
 * stays comfortably within free-tier limits.
 */
export function chunkText(
  text: string,
  opts: { maxTokens?: number; overlapTokens?: number } = {},
): Chunk[] {
  const maxTokens = opts.maxTokens ?? 6000;
  const overlapTokens = opts.overlapTokens ?? 200;
  const maxChars = maxTokens * 4;
  const overlapChars = overlapTokens * 4;

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: Chunk[] = [];
  let buf = "";

  const flush = () => {
    const trimmed = buf.trim();
    if (trimmed) {
      chunks.push({ index: chunks.length, text: trimmed, tokenEstimate: estimateTokens(trimmed) });
    }
  };

  for (const para of paragraphs) {
    if (para.length > maxChars) {
      // A single huge paragraph: hard-split it.
      flush();
      buf = "";
      for (let i = 0; i < para.length; i += maxChars) {
        const slice = para.slice(i, i + maxChars);
        chunks.push({ index: chunks.length, text: slice, tokenEstimate: estimateTokens(slice) });
      }
      continue;
    }
    if (buf.length + para.length + 2 > maxChars) {
      flush();
      const tail = buf.slice(Math.max(0, buf.length - overlapChars));
      buf = tail ? `${tail}\n\n${para}` : para;
    } else {
      buf = buf ? `${buf}\n\n${para}` : para;
    }
  }
  flush();

  return chunks.length ? chunks : [{ index: 0, text: text.trim(), tokenEstimate: estimateTokens(text) }];
}
