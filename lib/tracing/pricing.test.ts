import { describe, expect, it } from "vitest";

import type { NodeTrace } from "./record";
import { computeTotalCostUsd, getPricing } from "./pricing";

function node(overrides: Partial<NodeTrace> = {}): NodeTrace {
  return { node: "prdAgent", latencyMs: 100, mcpCalls: [], ...overrides };
}

describe("getPricing", () => {
  it("returns the known rate for each of this project's three supported provider/model combos", () => {
    expect(getPricing("anthropic", "claude-haiku-4-5")).toEqual({
      inputPerMillionUsd: 1,
      outputPerMillionUsd: 5,
    });
    expect(getPricing("openai", "gpt-4o-mini")).toEqual({
      inputPerMillionUsd: 0.15,
      outputPerMillionUsd: 0.6,
    });
    expect(getPricing("google", "gemini-2.5-flash")).toEqual({
      inputPerMillionUsd: 0.3,
      outputPerMillionUsd: 2.5,
    });
  });

  it("still prices retired models' historical traces instead of reporting $0", () => {
    expect(getPricing("google", "gemini-3.6-flash")).toEqual({
      inputPerMillionUsd: 0.75,
      outputPerMillionUsd: 3.75,
    });
    expect(getPricing("google", "gemini-2.0-flash")).toEqual({
      inputPerMillionUsd: 0.1,
      outputPerMillionUsd: 0.4,
    });
  });

  it("falls back to zero pricing instead of throwing for an unrecognized provider/model", () => {
    expect(getPricing("anthropic", "some-future-model")).toEqual({
      inputPerMillionUsd: 0,
      outputPerMillionUsd: 0,
    });
  });
});

describe("computeTotalCostUsd", () => {
  it("computes cost from the actual recorded token counts across all nodes, not a flat estimate", () => {
    const pricing = { inputPerMillionUsd: 1, outputPerMillionUsd: 5 };
    const nodes: NodeTrace[] = [
      node({ node: "prdAgent", inputTokens: 1_000_000, outputTokens: 200_000 }),
      node({ node: "roadmapAgent", inputTokens: 500_000, outputTokens: 100_000 }),
    ];

    // (1.5M in * $1/M) + (0.3M out * $5/M) = $1.5 + $1.5 = $3
    expect(computeTotalCostUsd(nodes, pricing)).toBeCloseTo(3, 6);
  });

  it("scales with token counts — doubling every node's tokens doubles the cost", () => {
    const pricing = { inputPerMillionUsd: 2, outputPerMillionUsd: 8 };
    const small: NodeTrace[] = [node({ inputTokens: 100_000, outputTokens: 50_000 })];
    const large: NodeTrace[] = [node({ inputTokens: 200_000, outputTokens: 100_000 })];

    expect(computeTotalCostUsd(large, pricing)).toBeCloseTo(computeTotalCostUsd(small, pricing) * 2, 6);
  });

  it("treats nodes with no token counts (no model call, e.g. supervisor/assembler) as contributing zero cost", () => {
    const pricing = { inputPerMillionUsd: 1, outputPerMillionUsd: 5 };
    const nodes: NodeTrace[] = [node({ node: "supervisor" }), node({ node: "assembler" })];

    expect(computeTotalCostUsd(nodes, pricing)).toBe(0);
  });
});
