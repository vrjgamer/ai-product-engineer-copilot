import { describe, expect, it } from "vitest";

import { recordMcpCall, recordTokenUsage, withNodeTracing, withRunTracing } from "./collect";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("withNodeTracing outside withRunTracing", () => {
  it("is a no-op passthrough — no collector to report into", async () => {
    const value = await withNodeTracing("prdAgent", async () => "ok");
    expect(value).toBe("ok");
  });

  it("still propagates a thrown error", async () => {
    await expect(
      withNodeTracing("prdAgent", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });

  it("recordTokenUsage/recordMcpCall are no-ops with no active run", () => {
    expect(() => recordTokenUsage(10, 20)).not.toThrow();
    expect(() => recordMcpCall("search_docs")).not.toThrow();
  });
});

describe("withRunTracing + withNodeTracing", () => {
  it("collects one NodeTrace per node, in the order each node completed", async () => {
    const { nodes } = await withRunTracing(async () => {
      await withNodeTracing("supervisor", async () => {});
      await withNodeTracing("prdAgent", async () => {});
      await withNodeTracing("roadmapAgent", async () => {});
    });

    expect(nodes.map((node) => node.node)).toEqual(["supervisor", "prdAgent", "roadmapAgent"]);
    for (const node of nodes) {
      expect(typeof node.latencyMs).toBe("number");
      expect(node.latencyMs).toBeGreaterThanOrEqual(0);
      expect(node.mcpCalls).toEqual([]);
    }
  });

  it("records a longer-running node's latency as greater than a near-instant one", async () => {
    const { nodes } = await withRunTracing(async () => {
      await withNodeTracing("fast", async () => {});
      await withNodeTracing("slow", () => delay(30));
    });

    const fast = nodes.find((node) => node.node === "fast")!;
    const slow = nodes.find((node) => node.node === "slow")!;
    expect(slow.latencyMs).toBeGreaterThan(fast.latencyMs);
  });

  it("attributes recordTokenUsage calls to the currently running node, summing multiple calls", async () => {
    const { nodes } = await withRunTracing(async () => {
      await withNodeTracing("prdAgent", async () => {
        recordTokenUsage(100, 50);
        recordTokenUsage(20, 10);
      });
      await withNodeTracing("roadmapAgent", async () => {
        recordTokenUsage(200, 80);
      });
    });

    const prd = nodes.find((node) => node.node === "prdAgent")!;
    const roadmap = nodes.find((node) => node.node === "roadmapAgent")!;
    expect(prd.inputTokens).toBe(120);
    expect(prd.outputTokens).toBe(60);
    expect(roadmap.inputTokens).toBe(200);
    expect(roadmap.outputTokens).toBe(80);
  });

  it("omits inputTokens/outputTokens for a node that never called recordTokenUsage (e.g. supervisor/assembler — no model call)", async () => {
    const { nodes } = await withRunTracing(async () => {
      await withNodeTracing("supervisor", async () => {});
    });

    expect(nodes[0].inputTokens).toBeUndefined();
    expect(nodes[0].outputTokens).toBeUndefined();
  });

  it("records recordMcpCall calls against the currently running node, in call order", async () => {
    const { nodes } = await withRunTracing(async () => {
      await withNodeTracing("prdAgent", async () => {
        recordMcpCall("search_docs");
      });
      await withNodeTracing("roadmapAgent", async () => {
        recordMcpCall("get_repo_stats");
      });
    });

    expect(nodes.find((node) => node.node === "prdAgent")!.mcpCalls).toEqual(["search_docs"]);
    expect(nodes.find((node) => node.node === "roadmapAgent")!.mcpCalls).toEqual(["get_repo_stats"]);
  });

  it("still records a trace for a node whose function throws — a partial-failure run isn't skipped", async () => {
    const { nodes } = await withRunTracing(async () => {
      await withNodeTracing("supervisor", async () => {});
      await expect(
        withNodeTracing("prdAgent", async () => {
          recordTokenUsage(50, 10);
          throw new Error("model unavailable");
        }),
      ).rejects.toThrow("model unavailable");
    });

    expect(nodes.map((node) => node.node)).toEqual(["supervisor", "prdAgent"]);
    const failed = nodes.find((node) => node.node === "prdAgent")!;
    expect(failed.inputTokens).toBe(50);
    expect(failed.outputTokens).toBe(10);
  });

  it("keeps concurrent nodes' token/MCP-call attribution isolated from each other", async () => {
    const { nodes } = await withRunTracing(async () => {
      await Promise.all([
        withNodeTracing("userStoryAgent", async () => {
          recordTokenUsage(10, 1);
          recordMcpCall("tool-a");
        }),
        withNodeTracing("architectureReviewAgent", async () => {
          recordTokenUsage(20, 2);
          recordMcpCall("tool-b");
        }),
      ]);
    });

    const userStory = nodes.find((node) => node.node === "userStoryAgent")!;
    const architecture = nodes.find((node) => node.node === "architectureReviewAgent")!;
    expect(userStory.inputTokens).toBe(10);
    expect(userStory.mcpCalls).toEqual(["tool-a"]);
    expect(architecture.inputTokens).toBe(20);
    expect(architecture.mcpCalls).toEqual(["tool-b"]);
  });
});
