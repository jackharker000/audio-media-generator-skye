import { FatalPipelineError } from "./errors";
import {
  critiqueLyrics,
  rewriteLyrics,
  factCheckLyrics,
  dropContradictedLines,
} from "./stages/songwriting";
import type { KnowledgeMap, LyricDraft, SongPlan } from "@/agents/schemas";
import type { JobInputParams, StageName } from "@/shared/types";

/**
 * Abstraction over "run this stage" so the refinement core can be driven by the
 * checkpointed in-process pipeline runner in production and by a trivial runner
 * in tests.
 */
export interface StageRunner {
  run<T>(stepId: string, stage: StageName, fn: () => Promise<T>): Promise<T>;
}

/**
 * Stages 6-8 — the accuracy core. Runs a bounded critique→rewrite loop, then an
 * independent grounding gate that repairs contradicted lines once and hard-fails
 * if they still can't be verified. Free of runner/DB deps so it is unit-testable.
 */
export async function refineAndVerify(
  runner: StageRunner,
  args: {
    draft: LyricDraft;
    km: KnowledgeMap;
    plan: SongPlan;
    input: JobInputParams;
    maxRewrites: number;
  },
): Promise<LyricDraft> {
  const { km, plan, input, maxRewrites } = args;
  let draft = args.draft;

  // Bounded critique → rewrite loop.
  for (let i = 0; i <= maxRewrites; i++) {
    const critique = await runner.run(`critique-${i}`, "critique", () =>
      critiqueLyrics(draft, km, plan, input),
    );
    if (critique.pass || i === maxRewrites) break;
    draft = await runner.run(`rewrite-${i}`, "rewrite", () =>
      rewriteLyrics(draft, km, plan, critique),
    );
  }

  // Independent fact-check gate.
  const grounding = await runner.run("fact_check", "fact_check", () =>
    factCheckLyrics(draft, km),
  );
  if (grounding.hardFail) {
    const repaired = dropContradictedLines(draft, grounding);
    const recheck = await runner.run("fact_check_recheck", "fact_check", () =>
      factCheckLyrics(repaired, km),
    );
    if (recheck.hardFail) {
      throw new FatalPipelineError(
        "Couldn't verify some lyrics against your sources. Try narrowing the focus or providing clearer source text.",
      );
    }
    return repaired;
  }

  return draft;
}
