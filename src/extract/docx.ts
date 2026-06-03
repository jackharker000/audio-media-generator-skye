import type { ExtractResult } from "./index";

/** Extract raw text from a .docx using mammoth. */
export async function extractDocx(buffer: Buffer): Promise<ExtractResult> {
  const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
  try {
    const result = await (mammoth as any).extractRawText({ buffer });
    return {
      text: String(result.value ?? "").trim(),
      warnings: (result.messages ?? [])
        .filter((m: any) => m.type === "warning")
        .map((m: any) => String(m.message))
        .slice(0, 5),
    };
  } catch (err) {
    return { text: "", warnings: [`Failed to read DOCX: ${(err as Error).message}`] };
  }
}
