import type { AssembledResult } from "../graph/state";
import { generateJudgeText, getJudgeModelConfig, type JudgeCall } from "./judgeModel";
import {
  DELIVERABLE_NAMES,
  JudgeParseError,
  buildJudgePrompt,
  meanScore,
  parseJudgment,
  type DeliverableName,
  type FailureTag,
  type Judgment,
} from "./rubric";

export type JudgeCallFn = (system: string, prompt: string) => Promise<JudgeCall>;

export interface DeliverableJudgment {
  deliverable: DeliverableName;
  judgment: Judgment;
  /** Mean of the four rubric dimensions — precomputed so consumers (gate, trace page) don't each re-derive it. */
  score: number;
}

export interface RunEvaluation {
  /** Mean of the judged deliverables' scores, or 0 when a run produced nothing to judge. */
  overall: number;
  deliverables: DeliverableJudgment[];
  /** Deliverables the run didn't produce at all. Not scored — see below. */
  missing: DeliverableName[];
  /** Union of every tag across deliverables, for a quick "what went wrong" read. */
  tags: FailureTag[];
  judgeModelId: string;
  costUsd: number;
}

/**
 * A judgment the model wouldn't produce cleanly the first time gets exactly
 * one more chance. Beyond that the judgment is unusable and
 * `JudgeParseError` propagates: a judge that can't answer is a broken
 * *instrument*, and reporting that as a low score would silently blame the
 * system under test for the grader's failure.
 */
const JUDGE_ATTEMPTS = 2;

export async function judgeDeliverable(
  deliverable: DeliverableName,
  request: string,
  content: string,
  generate: JudgeCallFn = generateJudgeText,
): Promise<{ judgment: Judgment; costUsd: number }> {
  const { system, prompt } = buildJudgePrompt({ deliverable, request, content });

  let costUsd = 0;
  let lastError: unknown;

  for (let attempt = 0; attempt < JUDGE_ATTEMPTS; attempt += 1) {
    const call = await generate(system, prompt);
    costUsd += call.usage.costUsd;
    try {
      return { judgment: parseJudgment(call.text), costUsd };
    } catch (error) {
      if (!(error instanceof JudgeParseError)) throw error;
      lastError = error;
    }
  }

  throw lastError;
}

/**
 * Grades one run's assembled output (TDD 0011, ARCHITECTURE.md §9).
 *
 * A deliverable the run never produced is listed in `missing` rather than
 * scored 1: a node that failed is an *availability* failure, already visible
 * in `result.errors` and the run trace, and folding it into the quality mean
 * would make an outage look like bad writing. The gate
 * (`lib/eval/gate.ts`) treats a missing deliverable as a failure on its own
 * terms.
 *
 * Deliverables are judged concurrently but in separate calls — see
 * `buildJudgePrompt` for why they are never graded together.
 */
export async function judgeRun(
  request: string,
  result: AssembledResult,
  generate: JudgeCallFn = generateJudgeText,
): Promise<RunEvaluation> {
  const present = DELIVERABLE_NAMES.map((deliverable) => ({
    deliverable,
    content: result[deliverable]?.content?.trim() ?? "",
  }));

  const missing = present
    .filter(({ content }) => content.length === 0)
    .map(({ deliverable }) => deliverable);

  const judged = await Promise.all(
    present
      .filter(({ content }) => content.length > 0)
      .map(async ({ deliverable, content }) => {
        const { judgment, costUsd } = await judgeDeliverable(deliverable, request, content, generate);
        return {
          entry: { deliverable, judgment, score: meanScore(judgment) } satisfies DeliverableJudgment,
          costUsd,
        };
      }),
  );

  const deliverables = judged.map(({ entry }) => entry);
  const overall =
    deliverables.length > 0
      ? deliverables.reduce((sum, entry) => sum + entry.score, 0) / deliverables.length
      : 0;

  return {
    overall,
    deliverables,
    missing,
    tags: [...new Set(deliverables.flatMap((entry) => entry.judgment.tags))],
    judgeModelId: getJudgeModelConfig().modelId,
    costUsd: judged.reduce((sum, { costUsd }) => sum + costUsd, 0),
  };
}
