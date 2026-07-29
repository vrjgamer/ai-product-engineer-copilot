import type { FailureTag } from "../eval/taxonomy.js";
import type { StepTrace } from "./types.js";

export class TraceStore {
  private readonly traces: StepTrace[] = [];

  record(trace: StepTrace): void {
    this.traces.push(trace);
  }

  tracesForRun(runId: string): StepTrace[] {
    return this.traces.filter((trace) => trace.runId === runId);
  }

  /** A run's total cost, computed from its step traces rather than estimated separately. */
  getRunCost(runId: string): number {
    return this.tracesForRun(runId).reduce((sum, trace) => sum + trace.costUsd, 0);
  }

  queryByFailureTag(tag: FailureTag): StepTrace[] {
    return this.traces.filter((trace) => trace.failureTags.includes(tag));
  }
}
