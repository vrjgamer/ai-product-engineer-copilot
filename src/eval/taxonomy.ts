export type FailureTag = "hallucination" | "planning" | "tool" | "context";

export interface TaggingSignals {
  /** Numeric claims the generated output made, if any. */
  claimedMetrics?: number[];
  /** The ground-truth numbers actually returned by the analytics MCP server. */
  groundTruthMetrics?: number[];
  planFailed?: boolean;
  toolFailed?: boolean;
  ignoredAvailableContext?: boolean;
}

/** Tags a run with zero or more failure categories, derived from structured signals. */
export function tagFailures(signals: TaggingSignals): FailureTag[] {
  const tags: FailureTag[] = [];

  if (signals.claimedMetrics && signals.groundTruthMetrics) {
    const fabricated = signals.claimedMetrics.some(
      (claimed) => !signals.groundTruthMetrics!.includes(claimed)
    );
    if (fabricated) tags.push("hallucination");
  }

  if (signals.planFailed) tags.push("planning");
  if (signals.toolFailed) tags.push("tool");
  if (signals.ignoredAvailableContext) tags.push("context");

  return tags;
}
