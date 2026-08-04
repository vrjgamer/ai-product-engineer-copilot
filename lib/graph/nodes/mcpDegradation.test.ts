import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

const generateText = vi.fn();
const searchDocsTool = vi.fn();
const getRepoStatsTool = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
}));

vi.mock("../../models/provider", () => ({
  getModel: () => ({ modelId: "mock-model" }),
}));

vi.mock("../../../mcp/tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../mcp/tools")>();
  return {
    ...actual,
    searchDocsTool: (...args: unknown[]) => searchDocsTool(...args),
    getRepoStatsTool: (...args: unknown[]) => getRepoStatsTool(...args),
  };
});

import type { GraphState } from "../state";
import { architectureReviewAgent } from "./architectureReviewAgent";
import { prdAgent } from "./prdAgent";
import { roadmapAgent } from "./roadmapAgent";
import { userStoryAgent } from "./userStoryAgent";

const FIXTURE_STATS = {
  repo: "vrjgamer/ai-product-engineer-copilot",
  stars: 10,
  openIssues: 2,
  commitVelocity: 5,
  prMergeRate: 0.8,
  fetchedAt: "2026-01-01T00:00:00.000Z",
};

// Node functions return `GraphStateUpdate`, whose per-field type is a union
// with LangGraph's `OverwriteValue<T>` escape hatch (unused by this
// codebase's reducers) — narrow back to the plain `{ content }` shape our
// nodes actually return.
function contentOf(value: unknown): string | undefined {
  return (value as { content?: string } | null | undefined)?.content;
}

function baseState(overrides: Partial<GraphState> = {}): GraphState {
  return {
    request: "Build a todo app",
    prd: null,
    userStories: null,
    architectureReview: null,
    experimentDesign: null,
    roadmap: null,
    errors: [],
    result: null,
    ...overrides,
  };
}

beforeEach(() => {
  generateText.mockReset();
  generateText.mockImplementation(async () => ({ text: "generated content" }));
  searchDocsTool.mockReset();
  searchDocsTool.mockResolvedValue({ passages: [] });
  getRepoStatsTool.mockReset();
  getRepoStatsTool.mockResolvedValue(FIXTURE_STATS);
});

describe("docs-store MCP wiring", () => {
  it("prdAgent continues with a degraded PRD and an errors entry when search_docs throws", async () => {
    searchDocsTool.mockRejectedValueOnce(new Error("docs-store unreachable"));

    const update = await prdAgent(baseState());

    expect(contentOf(update.prd)).toContain("generated content");
    expect(contentOf(update.prd)).toContain("unavailable");
    expect(update.errors).toEqual([{ node: "prdAgent", message: "docs-store unreachable" }]);
  });

  it("userStoryAgent continues with a degraded output and an errors entry when search_docs throws", async () => {
    searchDocsTool.mockRejectedValueOnce(new Error("docs-store unreachable"));

    const update = await userStoryAgent(baseState({ prd: { content: "PRD content" } }));

    expect(contentOf(update.userStories)).toContain("unavailable");
    expect(update.errors).toEqual([{ node: "userStoryAgent", message: "docs-store unreachable" }]);
  });
});

describe("analytics MCP wiring", () => {
  it("roadmapAgent continues with a degraded roadmap and an errors entry when get_repo_stats throws", async () => {
    getRepoStatsTool.mockRejectedValueOnce(new Error("GitHub API rate-limited"));

    const update = await roadmapAgent(
      baseState({
        prd: { content: "PRD" },
        userStories: { content: "US" },
        architectureReview: { content: "AR" },
        experimentDesign: { content: "ED" },
      }),
    );

    expect(contentOf(update.roadmap)).toContain("unavailable");
    expect(update.errors).toEqual([{ node: "roadmapAgent", message: "GitHub API rate-limited" }]);
  });

  it("architectureReviewAgent continues and records both a docs-store and an analytics failure", async () => {
    searchDocsTool.mockRejectedValueOnce(new Error("docs-store unreachable"));
    getRepoStatsTool.mockRejectedValueOnce(new Error("GitHub API rate-limited"));

    const update = await architectureReviewAgent(baseState({ prd: { content: "PRD content" } }));

    expect(contentOf(update.architectureReview)).toContain("unavailable");
    expect(update.errors).toEqual(
      expect.arrayContaining([
        { node: "architectureReviewAgent", message: "docs-store unreachable" },
        { node: "architectureReviewAgent", message: "GitHub API rate-limited" },
      ]),
    );
    expect(update.errors).toHaveLength(2);
  });
});
