import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
}));

vi.mock("../models/provider", () => ({
  getModel: () => ({ modelId: "mock-model" }),
}));

import { buildGraph } from "./index";

// Each node's system prompt starts with a unique "You are a <role>" phrase
// (see lib/graph/nodes/*.ts) — these substrings don't collide with each
// other, unlike generic terms like "PRD" or "user stories" that appear in
// several nodes' prompts (e.g. roadmapAgent's prompt mentions all four
// upstream deliverables by name).
const NODE_BY_ROLE: Record<string, string> = {
  "product manager": "prdAgent",
  "product analyst": "userStoryAgent",
  "software architect": "architectureReviewAgent",
  "product data scientist": "experimentDesignAgent",
  "product lead": "roadmapAgent",
};

const CONTENT_BY_NODE: Record<string, string> = {
  prdAgent: "PRD content",
  userStoryAgent: "User stories content",
  architectureReviewAgent: "Architecture review content",
  experimentDesignAgent: "Experiment design content",
  roadmapAgent: "Roadmap content",
};

function nodeNameFor(system: string): string {
  const match = Object.entries(NODE_BY_ROLE).find(([role]) => system.includes(role));
  if (!match) throw new Error(`Unrecognized system prompt: ${system}`);
  return match[1];
}

describe("buildGraph", () => {
  beforeEach(() => {
    generateText.mockReset();
    generateText.mockImplementation(async ({ system }: { system: string }) => ({
      text: CONTENT_BY_NODE[nodeNameFor(system)],
    }));
  });

  it("runs prdAgent before any of the three fan-out nodes start", async () => {
    const order: string[] = [];
    generateText.mockImplementation(async ({ system }: { system: string }) => {
      const node = nodeNameFor(system);
      order.push(node);
      return { text: CONTENT_BY_NODE[node] };
    });

    const graph = buildGraph();
    await graph.invoke({ request: "Build a todo app" });

    const prdIndex = order.indexOf("prdAgent");
    const fanOutIndices = ["userStoryAgent", "architectureReviewAgent", "experimentDesignAgent"].map(
      (name) => order.indexOf(name),
    );

    expect(prdIndex).toBe(0);
    for (const index of fanOutIndices) {
      expect(index).toBeGreaterThan(prdIndex);
    }
  });

  it("passes the PRD produced by prdAgent into all three fan-out nodes' model calls", async () => {
    const graph = buildGraph();
    await graph.invoke({ request: "Build a todo app" });

    const calls = generateText.mock.calls as [{ system: string; prompt: string }][];
    const fanOutCalls = calls.filter(([{ system }]) =>
      ["userStoryAgent", "architectureReviewAgent", "experimentDesignAgent"].includes(
        nodeNameFor(system),
      ),
    );

    expect(fanOutCalls).toHaveLength(3);
    for (const [{ prompt }] of fanOutCalls) {
      expect(prompt).toContain("PRD content");
    }
  });

  it("does not run roadmapAgent until all three fan-out nodes have completed", async () => {
    const order: string[] = [];
    generateText.mockImplementation(async ({ system }: { system: string }) => {
      const node = nodeNameFor(system);
      order.push(node);
      return { text: CONTENT_BY_NODE[node] };
    });

    const graph = buildGraph();
    await graph.invoke({ request: "Build a todo app" });

    const roadmapIndex = order.indexOf("roadmapAgent");
    const fanOutNodes = ["userStoryAgent", "architectureReviewAgent", "experimentDesignAgent"];

    expect(roadmapIndex).toBe(order.length - 1);
    for (const node of fanOutNodes) {
      expect(order.indexOf(node)).toBeLessThan(roadmapIndex);
    }
  });

  it("assembles all five outputs into a single merged result", async () => {
    const graph = buildGraph();
    const finalState = await graph.invoke({ request: "Build a todo app" });

    expect(finalState.result).toEqual({
      prd: { content: "PRD content" },
      userStories: { content: "User stories content" },
      architectureReview: { content: "Architecture review content" },
      experimentDesign: { content: "Experiment design content" },
      roadmap: { content: "Roadmap content" },
      errors: [],
    });
  });

  it("continues the graph run when a sub-agent's model call throws, recording an errors entry", async () => {
    generateText.mockImplementation(async ({ system }: { system: string }) => {
      const node = nodeNameFor(system);
      if (node === "userStoryAgent") {
        throw new Error("model unavailable");
      }
      return { text: CONTENT_BY_NODE[node] };
    });

    const graph = buildGraph();
    const finalState = await graph.invoke({ request: "Build a todo app" });

    expect(finalState.userStories).toBeNull();
    expect(finalState.errors).toEqual([{ node: "userStoryAgent", message: "model unavailable" }]);
    // Nodes that don't depend on the failed userStoryAgent still complete.
    expect(finalState.architectureReview).toEqual({ content: "Architecture review content" });
    expect(finalState.experimentDesign).toEqual({ content: "Experiment design content" });
    expect(finalState.roadmap).toEqual({ content: "Roadmap content" });
  });

  it("records an errors entry for each of two fan-out nodes that fail in the same superstep", async () => {
    generateText.mockImplementation(async ({ system }: { system: string }) => {
      const node = nodeNameFor(system);
      if (node === "userStoryAgent" || node === "experimentDesignAgent") {
        throw new Error(`${node} unavailable`);
      }
      return { text: CONTENT_BY_NODE[node] };
    });

    const graph = buildGraph();
    const finalState = await graph.invoke({ request: "Build a todo app" });

    expect(finalState.userStories).toBeNull();
    expect(finalState.experimentDesign).toBeNull();
    expect(finalState.errors).toEqual(
      expect.arrayContaining([
        { node: "userStoryAgent", message: "userStoryAgent unavailable" },
        { node: "experimentDesignAgent", message: "experimentDesignAgent unavailable" },
      ]),
    );
    expect(finalState.errors).toHaveLength(2);
    // The node with no dependency on either failure still completes.
    expect(finalState.architectureReview).toEqual({ content: "Architecture review content" });
    expect(finalState.roadmap).toEqual({ content: "Roadmap content" });
  });

  it("produces a fully-successful run with all five output fields populated and no errors", async () => {
    const graph = buildGraph();
    const finalState = await graph.invoke({ request: "Build a todo app" });

    expect(finalState.prd).not.toBeNull();
    expect(finalState.userStories).not.toBeNull();
    expect(finalState.architectureReview).not.toBeNull();
    expect(finalState.experimentDesign).not.toBeNull();
    expect(finalState.roadmap).not.toBeNull();
    expect(finalState.errors).toEqual([]);
  });
});
