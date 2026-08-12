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

// Only the real (I/O-doing) tool-call functions are mocked — formatDocsContext/
// formatRepoStats stay real, pure functions, so prompt-building doesn't need
// re-implementing here.
vi.mock("../../mcp/tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../mcp/tools")>();
  return {
    ...actual,
    searchDocsTool: (...args: unknown[]) => searchDocsTool(...args),
    getRepoStatsTool: (...args: unknown[]) => getRepoStatsTool(...args),
  };
});

import { buildGraph } from "./index";

const FIXTURE_REPO_STATS = {
  repo: "vrjgamer/ai-product-engineer-copilot",
  stars: 10,
  openIssues: 2,
  commitVelocity: 5,
  prMergeRate: 0.8,
  fetchedAt: "2026-01-01T00:00:00.000Z",
};

// Each node's system prompt starts with a unique "You are a <role>" phrase
// (see lib/graph/nodes/*.ts) — these substrings don't collide with each
// other, unlike generic terms like "PRD" or "user stories" that appear in
// several nodes' prompts (e.g. roadmapAgent's prompt mentions all four
// upstream deliverables by name).
const NODE_BY_ROLE: Record<string, string> = {
  "product discovery lead": "supervisor",
  "product manager": "prdAgent",
  "product analyst": "userStoryAgent",
  "software architect": "architectureReviewAgent",
  "product data scientist": "experimentDesignAgent",
  "product lead": "roadmapAgent",
};

const CONTENT_BY_NODE: Record<string, string> = {
  // TDD 0010: the supervisor's triage call answers with a JSON array of
  // clarifying questions. Empty by default — these cases all cover the
  // unclarified path, which is the one TDD 0002 shaped. The clarified path
  // has its own suite (lib/graph/clarification.test.ts).
  supervisor: "[]",
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
    searchDocsTool.mockReset();
    searchDocsTool.mockResolvedValue({ passages: [] });
    getRepoStatsTool.mockReset();
    getRepoStatsTool.mockResolvedValue(FIXTURE_REPO_STATS);
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

    // The supervisor's triage call (TDD 0010) is the run's first model call;
    // prdAgent is the first *deliverable-producing* one, still ahead of the
    // whole fan-out.
    expect(order[0]).toBe("supervisor");
    expect(prdIndex).toBe(1);
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

  it("degrades prdAgent's output instead of failing the run when docs-store's search_docs throws", async () => {
    // prdAgent is the only node that has called searchDocsTool by the time
    // it runs (the fan-out nodes haven't started yet), so rejecting the
    // first call targets prdAgent deterministically.
    searchDocsTool.mockRejectedValueOnce(new Error("docs-store unreachable"));

    const graph = buildGraph();
    const finalState = await graph.invoke({ request: "Build a todo app" });

    expect(finalState.prd?.content).toContain("PRD content");
    expect(finalState.prd?.content).toContain("unavailable");
    expect(finalState.errors).toEqual(
      expect.arrayContaining([{ node: "prdAgent", message: "docs-store unreachable" }]),
    );
    expect(finalState.result).not.toBeNull();
  });

  it("degrades roadmapAgent's output instead of failing the run when analytics's get_repo_stats throws", async () => {
    // architectureReviewAgent's fan-out call to getRepoStatsTool always
    // completes before roadmapAgent's (roadmapAgent only runs after the
    // fan-out joins), so the first call succeeds and the second — roadmap's
    // — is the one that fails.
    getRepoStatsTool.mockResolvedValueOnce(FIXTURE_REPO_STATS);
    getRepoStatsTool.mockRejectedValueOnce(new Error("GitHub API rate-limited"));

    const graph = buildGraph();
    const finalState = await graph.invoke({ request: "Build a todo app" });

    expect(finalState.roadmap?.content).toContain("Roadmap content");
    expect(finalState.roadmap?.content).toContain("unavailable");
    expect(finalState.errors).toEqual(
      expect.arrayContaining([{ node: "roadmapAgent", message: "GitHub API rate-limited" }]),
    );
    expect(finalState.result).not.toBeNull();
  });
});
