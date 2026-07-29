import { describe, it, expect } from "vitest";
import { tagFailures } from "./taxonomy.js";

describe("failure taxonomy", () => {
  it("tags a run with zero or more of hallucination/planning/tool/context", () => {
    expect(tagFailures({})).toEqual([]);

    expect(
      tagFailures({ planFailed: true, toolFailed: true })
    ).toEqual(["planning", "tool"]);

    expect(
      tagFailures({
        planFailed: true,
        toolFailed: true,
        ignoredAvailableContext: true,
        claimedMetrics: [0.42],
        groundTruthMetrics: [0.42],
      })
    ).toEqual(["planning", "tool", "context"]);
  });

  it("catches a fabricated analytics number as hallucination", () => {
    // Agent claims a 60% activation rate but analytics MCP only ever returned 42%.
    const tags = tagFailures({
      claimedMetrics: [0.6],
      groundTruthMetrics: [0.42, 18234],
    });

    expect(tags).toContain("hallucination");
  });

  it("does not tag hallucination when every claimed number is grounded", () => {
    const tags = tagFailures({
      claimedMetrics: [0.42],
      groundTruthMetrics: [0.42, 18234],
    });

    expect(tags).not.toContain("hallucination");
  });
});
