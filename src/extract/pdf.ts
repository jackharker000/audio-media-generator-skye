import type { ExtractResult } from "./index";

/** Extract text from a PDF using unpdf (serverless-friendly pdf.js build). */
export async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const clean = (Array.isArray(text) ? text.join("\n\n") : text).trim();
    const warnings: string[] = [];
    // Heuristic: a real PDF should yield more than a few chars per page.
    const needsOcr = clean.length < Math.max(40, totalPages * 20);
    if (needsOcr) {
      warnings.push(
        "This PDF appears to be scanned/image-based; little selectable text was found. OCR fallback may be limited.",
      );
    }
    return { text: clean, warnings, needsOcr };
  } catch (err) {
    return { text: "", warnings: [`Failed to read PDF: ${(err as Error).message}`] };
  }
}
