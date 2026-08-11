import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.fn();
const searchDocsTool = vi.fn();
const getRepoStatsTool = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
}));

vi.mock("../models/provider", () => ({
  getModel: () => ({ modelId: "mock-model" }),
}));

vi.mock("../../mcp/tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../mcp/tools")>();
  return {
    ...actual,
    searchDocsTool: (...args: unknown[]) => searchDocsTool(...args),
    getRepoStatsTool: (...args: unknown[]) => getRepoStatsTool(...args),
  };
});

import { buildGraph } from "./index";
import { withRunTracing } from "../tracing/collect";

const FIXTURE_REPO_STATS = {
  repo: "vrjgamer/ai-product-engineer-copilot",
  stars: 10,
  openIssues: 2,
  commitVelocity: 5,
  prMergeRate: 0.8,
  fetchedAt: "2026-01-01T00:00:00.000Z",
};

// Same role-substring mapping as lib/graph/index.test.ts — each node's system
// prompt starts with a unique "You are a <role>" phrase.
const NODE_BY_ROLE: Record<string, string> = {
  "product manager": "prdAgent",
  "product analyst": "userStoryAgent",
  "software architect": "architectureReviewAgent",
  "product data scientist": "experimentDesignAgent",
  "product lead": "roadmapAgent",
};

const USAGE_BY_NODE: Record<string, { inputTokens: number; outputTokens: number }> = {
  prdAgent: { inputTokens: 100, outputTokens: 50 },
  userStoryAgent: { inputTokens: 60, outputTokens: 30 },
  architectureReviewAgent: { inputTokens: 70, outputTokens: 35 },
  experimentDesignAgent: { inputTokens: 80, outputTokens: 40 },
  roadmapAgent: { inputTokens: 200, outputTokens: 90 },
};

function nodeNameFor(system: string): string {
  const match = Object.entries(NODE_BY_ROLE).find(([role]) => system.includes(role));
  if (!match) throw new Error(`Unrecognized system prompt: ${system}`);
  return match[1];
}

describe("run tracing through a real graph run", () => {
  beforeEach(() => {
    generateText.mockReset();
    generateText.mockImplementation(async ({ system }: { system: string }) => {
      const node = nodeNameFor(system);
      return { text: `${node} content`, usage: USAGE_BY_NODE[node] };
    });
    searchDocsTool.mockReset();
    searchDocsTool.mockResolvedValue({ passages: [] });
    getRepoStatsTool.mockReset();
    getRepoStatsTool.mockResolvedValue(FIXTURE_REPO_STATS);
  });

  it("produces a NodeTrace per node, in completion order, with each model-calling node's real token counts", async () => {
    const graph = buildGraph();
    const { nodes } = await withRunTracing(() => graph.invoke({ request: "Build a todo app" }));

    const order = nodes.map((node) => node.node);
    expect(order[0]).toBe("supervisor");
    expect(order[1]).toBe("prdAgent");
    expect(order[order.length - 2]).toBe("roadmapAgent");
    expect(order[order.length - 1]).toBe("assembler");
    expect(order).toHaveLength(7);

    for (const [node, usage] of Object.entries(USAGE_BY_NODE)) {
      const trace = nodes.find((n) => n.node === node)!;
      expect(trace.inputTokens).toBe(usage.inputTokens);
      expect(trace.outputTokens).toBe(usage.outputTokens);
      expect(trace.latencyMs).toBeGreaterThanOrEqual(0);
    }

    // supervisor and assembler make no model call.
    const supervisorTrace = nodes.find((n) => n.node === "supervisor")!;
    expect(supervisorTrace.inputTokens).toBeUndefined();
  });

  it("still produces a complete trace (every node represented) when a node's model call throws", async () => {
    generateText.mockImplementation(async ({ system }: { system: string }) => {
      const node = nodeNameFor(system);
      if (node === "userStoryAgent") throw new Error("model unavailable");
      return { text: `${node} content`, usage: USAGE_BY_NODE[node] };
    });

    const graph = buildGraph();
    const { result: finalState, nodes } = await withRunTracing(() =>
      graph.invoke({ request: "Build a todo app" }),
    );

    expect(finalState.errors).toEqual([{ node: "userStoryAgent", message: "model unavailable" }]);
    expect(nodes.map((node) => node.node)).toEqual(
      expect.arrayContaining([
        "supervisor",
        "prdAgent",
        "userStoryAgent",
        "architectureReviewAgent",
        "experimentDesignAgent",
        "roadmapAgent",
        "assembler",
      ]),
    );
    const failedNodeTrace = nodes.find((node) => node.node === "userStoryAgent")!;
    expect(failedNodeTrace.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
