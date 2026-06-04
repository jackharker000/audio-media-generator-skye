import { generateJson } from "@/agents/gemini";
import { ChunkFactsSchema, KnowledgeMapSchema, type Fact, type KnowledgeMap } from "@/agents/schemas";
import { factExtractionPrompt, knowledgeReducePrompt } from "@/agents/prompts";
import { chunkText } from "@/extract/chunk";
import { mapWithConcurrency } from "@/lib/utils";

/**
 * Stage 3 — map/reduce knowledge map. Per-chunk fact extraction (Flash-Lite,
 * the cheap bulk model) → hierarchical reduce for long docs → a final ranked
 * reduce (Flash). Keeps every call within free-tier token limits.
 */
export async function buildKnowledgeMap(
  normalizedText: string,
  focus?: string,
): Promise<KnowledgeMap> {
  const chunks = chunkText(normalizedText, { maxTokens: 6000 });

  // Map: extract facts per chunk. Concurrency 3 respects Gemini RPM.
  const perChunk = await mapWithConcurrency(chunks, 3, async (c) => {
    const p = factExtractionPrompt(c.text, focus);
    return generateJson({
      model: "flash-lite",
      system: p.system,
      prompt: p.prompt,
      schema: ChunkFactsSchema,
      temperature: 0.3,
    });
  });

  let facts: Fact[] = perChunk.flatMap((x) => x.facts);

  // Single small source: rank/cap in JS and skip the extra reduce LLM call.
  if (chunks.length === 1 && facts.length <= 40) {
    const ranked = [...facts]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 24)
      .map((f, i) => ({ ...f, factId: f.factId || `f${i + 1}` }));
    return { facts: ranked, themes: [], focusApplied: focus };
  }

  // Hierarchical reduce so the final prompt stays small for very long docs.
  if (facts.length > 80) {
    const batches: Fact[][] = [];
    for (let i = 0; i < facts.length; i += 60) batches.push(facts.slice(i, i + 60));
    const reduced = await mapWithConcurrency(batches, 2, async (b) => {
      const p = knowledgeReducePrompt(b, focus, 20);
      const km = await generateJson({
        model: "flash-lite",
        system: p.system,
        prompt: p.prompt,
        schema: KnowledgeMapSchema,
        temperature: 0.3,
      });
      return km.facts;
    });
    facts = reduced.flat();
  }

  const p = knowledgeReducePrompt(facts, focus, 24);
  const km = await generateJson({
    model: "flash",
    system: p.system,
    prompt: p.prompt,
    schema: KnowledgeMapSchema,
    temperature: 0.4,
  });

  // Normalize fact ids to f1..fN so downstream references are stable.
  km.facts = km.facts.map((f, i) => ({ ...f, factId: f.factId || `f${i + 1}` }));
  return km;
}
