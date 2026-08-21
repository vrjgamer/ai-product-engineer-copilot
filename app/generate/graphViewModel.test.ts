import { describe, expect, it } from "vitest";

import type { ProgressEvent } from "../../lib/graph/progress";
import type { NodeTrace } from "../../lib/tracing/record";
import { viewStateFromEvents, viewStateFromTrace } from "./graphViewModel";

describe("viewStateFromEvents", () => {
  it("starts every node pending before any event arrives", () => {
    const view = viewStateFromEvents([]);

    const supervisor = view.nodes.find((node) => node.name === "supervisor");
    expect(supervisor?.state).toBe("pending");
    expect(view.nodes).toHaveLength(8);
  });

  it("marks a node running, then completed, as its node-status events arrive", () => {
    const events: ProgressEvent[] = [{ type: "node-status", node: "prdAgent", status: "running" }];
    let view = viewStateFromEvents(events);
    expect(view.nodes.find((node) => node.name === "prdAgent")?.state).toBe("running");

    events.push({ type: "node-status", node: "prdAgent", status: "completed" });
    view = viewStateFromEvents(events);
    expect(view.nodes.find((node) => node.name === "prdAgent")?.state).toBe("completed");
  });

  it("marks a node in error from a node-status error event", () => {
    const events: ProgressEvent[] = [{ type: "node-status", node: "roadmapAgent", status: "error", error: "boom" }];
    const view = viewStateFromEvents(events);
    expect(view.nodes.find((node) => node.name === "roadmapAgent")?.state).toBe("error");
  });

  it("adds a tool-call leaf when it starts, and resolves it to completed", () => {
    const events: ProgressEvent[] = [{ type: "mcp-call", node: "prdAgent", tool: "search_docs", status: "started" }];
    let view = viewStateFromEvents(events);
    expect(view.nodes.find((node) => node.name === "prdAgent")?.tools).toEqual([
      { tool: "search_docs", state: "started" },
    ]);

    events.push({ type: "mcp-call", node: "prdAgent", tool: "search_docs", status: "completed" });
    view = viewStateFromEvents(events);
    expect(view.nodes.find((node) => node.name === "prdAgent")?.tools).toEqual([
      { tool: "search_docs", state: "completed" },
    ]);
  });

  it("shows a degraded tool call as an errored leaf rather than hiding it (0002's contract)", () => {
    const events: ProgressEvent[] = [
      { type: "mcp-call", node: "architectureReviewAgent", tool: "get_repo_stats", status: "started" },
      { type: "mcp-call", node: "architectureReviewAgent", tool: "get_repo_stats", status: "error", error: "rate-limited" },
    ];
    const view = viewStateFromEvents(events);
    expect(view.nodes.find((node) => node.name === "architectureReviewAgent")?.tools).toEqual([
      { tool: "get_repo_stats", state: "error" },
    ]);
  });

  it("marks the clarification gate skipped once the supervisor finishes without it ever reporting", () => {
    const events: ProgressEvent[] = [{ type: "node-status", node: "supervisor", status: "completed" }];
    const view = viewStateFromEvents(events);
    expect(view.nodes.find((node) => node.name === "clarificationGate")?.state).toBe("skipped");
  });

  it("leaves the clarification gate pending while the supervisor is still deciding", () => {
    const events: ProgressEvent[] = [{ type: "node-status", node: "supervisor", status: "running" }];
    const view = viewStateFromEvents(events);
    expect(view.nodes.find((node) => node.name === "clarificationGate")?.state).toBe("pending");
  });

  it("does not mark the gate skipped once it actually reports", () => {
    const events: ProgressEvent[] = [
      { type: "node-status", node: "clarificationGate", status: "completed" },
      { type: "node-status", node: "supervisor", status: "completed" },
    ];
    const view = viewStateFromEvents(events);
    expect(view.nodes.find((node) => node.name === "clarificationGate")?.state).toBe("completed");
  });
});

describe("viewStateFromTrace", () => {
  const NODES: NodeTrace[] = [
    { node: "supervisor", latencyMs: 100, mcpCalls: [] },
    { node: "prdAgent", latencyMs: 900, inputTokens: 500, outputTokens: 300, mcpCalls: ["search_docs"] },
    { node: "userStoryAgent", latencyMs: 700, mcpCalls: ["search_docs"] },
    { node: "architectureReviewAgent", latencyMs: 800, mcpCalls: ["search_docs", "get_repo_stats"] },
    { node: "experimentDesignAgent", latencyMs: 600, mcpCalls: [] },
    { node: "roadmapAgent", latencyMs: 400, mcpCalls: ["get_repo_stats"] },
    { node: "assembler", latencyMs: 10, mcpCalls: [] },
  ];

  it("marks every traced node completed, with its latency/tokens/tool calls", () => {
    const view = viewStateFromTrace(NODES);
    const prd = view.nodes.find((node) => node.name === "prdAgent");
    expect(prd?.state).toBe("completed");
    expect(prd?.latencyMs).toBe(900);
    expect(prd?.inputTokens).toBe(500);
    expect(prd?.tools).toEqual([{ tool: "search_docs", state: "completed" }]);
  });

  it("marks a node in the run's errors list as error even though it has a trace", () => {
    const view = viewStateFromTrace(NODES, new Set(["roadmapAgent"]));
    expect(view.nodes.find((node) => node.name === "roadmapAgent")?.state).toBe("error");
  });

  it("marks the clarification gate skipped when the run's trace never reached it", () => {
    const view = viewStateFromTrace(NODES);
    expect(view.nodes.find((node) => node.name === "clarificationGate")?.state).toBe("skipped");
  });

  it("leaves a node never reached (e.g. after a fatal error) pending, not skipped or errored", () => {
    const partial = NODES.slice(0, 2); // supervisor, prdAgent only
    const view = viewStateFromTrace(partial);
    expect(view.nodes.find((node) => node.name === "roadmapAgent")?.state).toBe("pending");
    expect(view.nodes.find((node) => node.name === "assembler")?.state).toBe("pending");
  });
});
