import { describe, expect, it } from "vitest";

import type { NodeTrace } from "../../lib/tracing/record";
import { viewStateFromTrace } from "./graphViewModel";
import { buildReplaySchedule, viewStateAtElapsed } from "./replaySchedule";

describe("buildReplaySchedule", () => {
  it("gives every traced node a start time no earlier than its dependencies finish", () => {
    const nodes: NodeTrace[] = [
      { node: "supervisor", latencyMs: 100, mcpCalls: [] },
      { node: "prdAgent", latencyMs: 900, mcpCalls: [] },
      { node: "prdApprovalGate", latencyMs: 50, mcpCalls: [] },
      { node: "userStoryAgent", latencyMs: 700, mcpCalls: [] },
      { node: "architectureReviewAgent", latencyMs: 800, mcpCalls: [] },
      { node: "experimentDesignAgent", latencyMs: 600, mcpCalls: [] },
      { node: "roadmapAgent", latencyMs: 400, mcpCalls: [] },
      { node: "assembler", latencyMs: 10, mcpCalls: [] },
    ];

    const schedule = buildReplaySchedule(nodes);
    const byName = new Map(schedule.steps.map((step) => [step.node, step]));

    expect(byName.get("supervisor")!.startMs).toBe(0);
    expect(byName.get("prdAgent")!.startMs).toBeGreaterThanOrEqual(byName.get("supervisor")!.endMs);
    expect(byName.get("prdApprovalGate")!.startMs).toBeGreaterThanOrEqual(byName.get("prdAgent")!.endMs);
    // The fan-out runs simultaneously, all starting once the PRD is approved.
    expect(byName.get("userStoryAgent")!.startMs).toBe(byName.get("prdApprovalGate")!.endMs);
    expect(byName.get("architectureReviewAgent")!.startMs).toBe(byName.get("prdApprovalGate")!.endMs);
    expect(byName.get("experimentDesignAgent")!.startMs).toBe(byName.get("prdApprovalGate")!.endMs);
    // The join waits for the slowest fan-out branch.
    const fanOutEnd = Math.max(
      byName.get("userStoryAgent")!.endMs,
      byName.get("architectureReviewAgent")!.endMs,
      byName.get("experimentDesignAgent")!.endMs,
    );
    expect(byName.get("roadmapAgent")!.startMs).toBe(fanOutEnd);
  });

  it("compresses the whole traversal into roughly 6-8 seconds regardless of real latency", () => {
    const nodes: NodeTrace[] = [
      { node: "supervisor", latencyMs: 5_000, mcpCalls: [] },
      { node: "prdAgent", latencyMs: 60_000, mcpCalls: [] },
      { node: "userStoryAgent", latencyMs: 20_000, mcpCalls: [] },
      { node: "roadmapAgent", latencyMs: 10_000, mcpCalls: [] },
      { node: "assembler", latencyMs: 2_000, mcpCalls: [] },
    ];

    const schedule = buildReplaySchedule(nodes);

    expect(schedule.totalMs).toBeGreaterThanOrEqual(6_000);
    expect(schedule.totalMs).toBeLessThanOrEqual(8_000);
  });

  it("skips a node with no trace entirely — it never got a slot", () => {
    const nodes: NodeTrace[] = [
      { node: "supervisor", latencyMs: 100, mcpCalls: [] },
      { node: "prdAgent", latencyMs: 200, mcpCalls: [] },
    ];

    const schedule = buildReplaySchedule(nodes);

    expect(schedule.steps.map((step) => step.node)).toEqual(["supervisor", "prdAgent"]);
  });

  it("gives every node a real, visible duration even when one node's real latency is a huge outlier", () => {
    // A single slow model/MCP call (very plausible in production) used to
    // dominate a linear real-latency scale, rounding every other node's
    // duration down to ~0ms — the whole graph would read as already
    // finished on the first animation frame instead of animating.
    const nodes: NodeTrace[] = [
      { node: "supervisor", latencyMs: 50, mcpCalls: [] },
      { node: "prdAgent", latencyMs: 120_000, mcpCalls: [] }, // one very slow model call
      { node: "userStoryAgent", latencyMs: 40, mcpCalls: [] },
      { node: "architectureReviewAgent", latencyMs: 40, mcpCalls: [] },
      { node: "experimentDesignAgent", latencyMs: 40, mcpCalls: [] },
      { node: "roadmapAgent", latencyMs: 30, mcpCalls: [] },
      { node: "assembler", latencyMs: 5, mcpCalls: [] },
    ];

    const schedule = buildReplaySchedule(nodes);

    for (const step of schedule.steps) {
      expect(step.endMs - step.startMs).toBeGreaterThan(0);
    }
  });
});

describe("viewStateAtElapsed", () => {
  const NODES: NodeTrace[] = [
    { node: "supervisor", latencyMs: 100, mcpCalls: [] },
    { node: "prdAgent", latencyMs: 900, mcpCalls: ["search_docs"] },
  ];
  const schedule = buildReplaySchedule(NODES);
  const finalView = viewStateFromTrace(NODES);

  it("shows a downstream node pending before its own scaled start, even once an earlier node is underway", () => {
    const view = viewStateAtElapsed(schedule, finalView, 0);
    // supervisor starts at t=0, so it's already running; prdAgent hasn't started yet.
    expect(view.nodes.find((node) => node.name === "supervisor")?.state).toBe("running");
    expect(view.nodes.find((node) => node.name === "prdAgent")?.state).toBe("pending");
  });

  it("shows a node running partway through its own scaled window", () => {
    const supervisorStep = schedule.steps.find((step) => step.node === "supervisor")!;
    const midpoint = Math.floor((supervisorStep.startMs + supervisorStep.endMs) / 2);
    const view = viewStateAtElapsed(schedule, finalView, midpoint);
    expect(view.nodes.find((node) => node.name === "supervisor")?.state).toBe("running");
  });

  it("shows the final outcome once elapsed passes the node's scaled end", () => {
    const view = viewStateAtElapsed(schedule, finalView, schedule.totalMs);
    expect(view.nodes.find((node) => node.name === "prdAgent")?.state).toBe("completed");
  });

  it("leaves a never-reached node pending at the end of the traversal too", () => {
    const view = viewStateAtElapsed(schedule, finalView, schedule.totalMs);
    expect(view.nodes.find((node) => node.name === "roadmapAgent")?.state).toBe("pending");
  });

  it("renders a skipped clarification gate as skipped throughout, not pending-then-running", () => {
    const view = viewStateAtElapsed(schedule, finalView, 0);
    expect(view.nodes.find((node) => node.name === "clarificationGate")?.state).toBe("skipped");
  });
});
