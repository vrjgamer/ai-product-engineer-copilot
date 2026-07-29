import type { FailureTag } from "../eval/taxonomy.js";
import type { StepKind, StepTrace } from "./types.js";

export interface StepMeta {
  runId: string;
  stepId: string;
  stepKind: StepKind;
}

export interface StepOutcome<T> {
  result: T;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  failureTags?: FailureTag[];
}

export interface TimedStep<T> {
  result: T;
  trace: StepTrace;
}

/** Wraps a step's execution to produce the per-step trace required by every run. */
export async function timeStep<T>(
  meta: StepMeta,
  fn: () => Promise<StepOutcome<T>>
): Promise<TimedStep<T>> {
  const startedAt = new Date().toISOString();
  const start = performance.now();
  const outcome = await fn();
  const latencyMs = performance.now() - start;

  return {
    result: outcome.result,
    trace: {
      runId: meta.runId,
      stepId: meta.stepId,
      stepKind: meta.stepKind,
      startedAt,
      latencyMs,
      inputTokens: outcome.inputTokens,
      outputTokens: outcome.outputTokens,
      costUsd: outcome.costUsd,
      failureTags: outcome.failureTags ?? [],
    },
  };
}
