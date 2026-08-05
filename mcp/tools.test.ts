import { describe, expect, it } from "vitest";

import { formatDocsContext, formatRepoStats } from "./tools";

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
