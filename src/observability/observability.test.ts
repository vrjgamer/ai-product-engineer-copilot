import { describe, it, expect } from "vitest";
import { TraceStore } from "./trace-store.js";
import { timeStep } from "./timed-step.js";

describe("per-step tracing", () => {
  it("emits a per-step trace with latency and token cost for every step", async () => {
    const store = new TraceStore();

    const { result, trace } = await timeStep(
      { runId: "run-1", stepId: "step-1", stepKind: "tool_call" },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { result: "ok", inputTokens: 120, outputTokens: 40, costUsd: 0.002 };
      }
    );
    store.record(trace);

    expect(result).toBe("ok");
    expect(trace.latencyMs).toBeGreaterThan(0);
    expect(trace.inputTokens).toBe(120);
    expect(trace.outputTokens).toBe(40);
    expect(trace.costUsd).toBeCloseTo(0.002);
  });
});

describe("run cost", () => {
  it("computes a full run's cost as the sum of its step traces", () => {
    const store = new TraceStore();
    const base = {
      runId: "run-1",
      startedAt: new Date().toISOString(),
      inputTokens: 100,
      outputTokens: 50,
      failureTags: [],
    };

    store.record({ ...base, stepId: "s1", stepKind: "plan", latencyMs: 10, costUsd: 0.01 });
    store.record({ ...base, stepId: "s2", stepKind: "tool_call", latencyMs: 20, costUsd: 0.02 });
    store.record({ ...base, stepId: "s3", stepKind: "generate", latencyMs: 30, costUsd: 0.03 });
    // A different run's cost must not leak into run-1's total.
    store.record({ ...base, runId: "run-2", stepId: "s1", stepKind: "plan", latencyMs: 5, costUsd: 99 });

    expect(store.getRunCost("run-1")).toBeCloseTo(0.06);
  });
});

describe("querying by failure tag", () => {
  it("returns only the traces tagged with the requested failure category", () => {
    const store = new TraceStore();
    const base = {
      runId: "run-1",
      startedAt: new Date().toISOString(),
      latencyMs: 10,
      inputTokens: 10,
      outputTokens: 10,
      costUsd: 0.001,
    };

    store.record({ ...base, stepId: "s1", stepKind: "tool_call", failureTags: ["tool"] });
    store.record({ ...base, stepId: "s2", stepKind: "generate", failureTags: ["hallucination"] });
    store.record({ ...base, stepId: "s3", stepKind: "plan", failureTags: [] });

    const toolFailures = store.queryByFailureTag("tool");

    expect(toolFailures).toHaveLength(1);
    expect(toolFailures[0].stepId).toBe("s1");
  });
});
