import type { FailureTag } from "../eval/taxonomy.js";

export type StepKind = "plan" | "tool_call" | "generate" | "judge";

export interface StepTrace {
  runId: string;
  stepId: string;
  stepKind: StepKind;
  startedAt: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  failureTags: FailureTag[];
}
