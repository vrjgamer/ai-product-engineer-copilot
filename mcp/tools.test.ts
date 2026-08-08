import { beforeEach, describe, expect, it, vi } from "vitest";

const callMcpTool = vi.fn();
vi.mock("./client", () => ({ callMcpTool: (...args: unknown[]) => callMcpTool(...args) }));

import { withNodeTracing, withRunTracing } from "../lib/tracing/collect";
import { formatDocsContext, formatRepoStats, searchDocsTool } from "./tools";

describe("withMcpCallProgress recording into the current node's trace (TDD 0007)", () => {
  beforeEach(() => {
    callMcpTool.mockReset();
  });

  it("records the tool name against whichever node is currently running", async () => {
    callMcpTool.mockResolvedValueOnce({ passages: [] });

    const { nodes } = await withRunTracing(() =>
      withNodeTracing("prdAgent", () => searchDocsTool("query")),
    );

    expect(nodes).toEqual([expect.objectContaining({ node: "prdAgent", mcpCalls: ["search_docs"] })]);
  });

  it("still records the call even when the tool call itself throws", async () => {
    callMcpTool.mockRejectedValueOnce(new Error("docs-store unreachable"));

    const { nodes } = await withRunTracing(() =>
      withNodeTracing("prdAgent", async () => {
        await expect(searchDocsTool("query")).rejects.toThrow("docs-store unreachable");
      }),
    );

    expect(nodes[0].mcpCalls).toEqual(["search_docs"]);
  });
});

describe("formatDocsContext", () => {
  it("returns an empty string when there are no passages", () => {
    expect(formatDocsContext({ passages: [] })).toBe("");
  });

  it("joins each passage's already-cited text on its own line under a header", () => {
    const result = formatDocsContext({
      passages: [
        { sourceId: "a.md", text: "[source:a.md] first passage" },
        { sourceId: "b.md", text: "[source:b.md] second passage" },
      ],
    });

    expect(result).toBe(
      "Relevant docs:\n[source:a.md] first passage\n[source:b.md] second passage",
    );
  });
});

describe("formatRepoStats", () => {
  it("formats stats into a single readable line, rounding the merge rate to a whole percent", () => {
    const result = formatRepoStats({
      repo: "acme/demo",
      stars: 42,
      openIssues: 3,
      commitVelocity: 7,
      prMergeRate: 0.8,
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result).toBe(
      "GitHub stats for acme/demo: 42 stars, 3 open issues, 7 commits in the last 7 days, 80% PR merge rate.",
    );
  });

  it("rounds a fractional merge rate to the nearest whole percent", () => {
    const result = formatRepoStats({
      repo: "acme/demo",
      stars: 0,
      openIssues: 0,
      commitVelocity: 0,
      prMergeRate: 0.665,
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(result).toContain("67% PR merge rate.");
  });
});
