import { generateText } from "ai";

import { getModel, getModelConfig, type ModelConfig } from "../models/provider";
import { getPricing } from "../tracing/pricing";

/**
 * The judge's own model, resolved separately from the graph's
 * (`JUDGE_PROVIDER`/`JUDGE_MODEL_ID`, each falling back to
 * `MODEL_PROVIDER`/`MODEL_ID`).
 *
 * The separation is the point: grading a model's output with the same model
 * invites self-preference bias, and this project's default is deliberately
 * the *cheapest* Claude model (ARCHITECTURE.md §2) — a fine writer for a
 * demo, a weak grader. Defaulting to the same model keeps the harness
 * runnable with one API key; pointing `JUDGE_MODEL_ID` at something stronger
 * is a one-env-var upgrade, and the control cases in `eval/golden/` will say
 * whether the judge you chose is calibrated enough to trust.
 */
export function getJudgeModelConfig(): ModelConfig {
  const fallback = getModelConfig();
  return {
    provider: process.env.JUDGE_PROVIDER ?? fallback.provider,
    modelId: process.env.JUDGE_MODEL_ID ?? fallback.modelId,
  };
}

export interface JudgeUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface JudgeCall {
  text: string;
  usage: JudgeUsage;
}

/**
 * One judge call, priced with the same table the run trace uses (TDD 0007) —
 * a quality gate that hides its own cost is exactly the kind of thing this
 * project's §7 argued against. Deliberately *not* routed through
 * `lib/graph/nodes/shared.ts`: judging is not a graph node, and folding its
 * tokens into a run's node traces would misattribute them to the node being
 * judged.
 */
export async function generateJudgeText(system: string, prompt: string): Promise<JudgeCall> {
  const config = getJudgeModelConfig();
  const { text, usage } = await generateText({ model: getModel(config), system, prompt });

  const inputTokens = usage?.inputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  const pricing = getPricing(config.provider, config.modelId);

  return {
    text,
    usage: {
      inputTokens,
      outputTokens,
      costUsd:
        (inputTokens / 1_000_000) * pricing.inputPerMillionUsd +
        (outputTokens / 1_000_000) * pricing.outputPerMillionUsd,
    },
  };
}
