import { extractPdf } from "./pdf";
import { extractDocx } from "./docx";

export interface ExtractResult {
  text: string;
  warnings: string[];
  needsOcr?: boolean;
}

/** Extract plain text from a document buffer based on filename/mime. */
export async function extractDocument(
  buffer: Buffer,
  filename: string,
  mime?: string,
): Promise<ExtractResult> {
  const lower = filename.toLowerCase();
  const m = mime ?? "";

  if (lower.endsWith(".pdf") || m.includes("pdf")) {
    return extractPdf(buffer);
  }
  if (
    lower.endsWith(".docx") ||
    m.includes("officedocument.wordprocessingml")
  ) {
    return extractDocx(buffer);
  }
  if (lower.endsWith(".doc")) {
    return { text: "", warnings: ["Legacy .doc not supported — please upload .docx, PDF, or text."] };
  }
  // txt / md / anything else: treat as utf-8 text.
  return { text: buffer.toString("utf8"), warnings: [] };
}
