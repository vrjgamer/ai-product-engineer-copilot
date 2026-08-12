// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { RunEvalRecord } from "../../lib/eval/record";
import type { RunTrace } from "../../lib/tracing/record";
import { TraceView } from "./TraceView";

afterEach(cleanup);

const FIXTURE_TRACE: RunTrace = {
  runId: "11111111-1111-1111-1111-111111111111",
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: "2026-01-01T00:00:06.500Z",
  totalCostUsd: 0.00234,
  nodes: [
    { node: "supervisor", latencyMs: 4, mcpCalls: [] },
    {
      node: "prdAgent",
      latencyMs: 820,
      inputTokens: 120,
      outputTokens: 300,
      mcpCalls: ["search_docs"],
    },
    {
      node: "roadmapAgent",
      latencyMs: 950,
      inputTokens: 400,
      outputTokens: 220,
      mcpCalls: ["get_repo_stats"],
    },
  ],
};

describe("TraceView", () => {
  it("links back to the plan the run produced (TDD 0012)", () => {
    render(<TraceView trace={FIXTURE_TRACE} />);

    expect(screen.getByTestId("view-plan-link").getAttribute("href")).toBe(
      `/run/${FIXTURE_TRACE.runId}`,
    );
  });

  it("renders the run's id, timestamps, and total cost", () => {
    render(<TraceView trace={FIXTURE_TRACE} />);

    expect(screen.getByTestId("trace-run-id").textContent).toBe(FIXTURE_TRACE.runId);
    expect(screen.getByTestId("trace-started-at").textContent).toBe(FIXTURE_TRACE.startedAt);
    expect(screen.getByTestId("trace-ended-at").textContent).toBe(FIXTURE_TRACE.endedAt);
    expect(screen.getByTestId("trace-total-cost").textContent).toBe("$0.0023");
  });

  it("renders one row per node with its latency, token usage, and MCP calls", () => {
    render(<TraceView trace={FIXTURE_TRACE} />);

    expect(screen.getByTestId("trace-latency-prdAgent").textContent).toBe("820");
    expect(screen.getByTestId("trace-input-tokens-prdAgent").textContent).toBe("120");
    expect(screen.getByTestId("trace-output-tokens-prdAgent").textContent).toBe("300");
    expect(screen.getByTestId("trace-mcp-calls-prdAgent").textContent).toBe("search_docs");

    expect(screen.getByTestId("trace-mcp-calls-roadmapAgent").textContent).toBe("get_repo_stats");
  });

  it("renders a placeholder instead of blank cells for a node with no model call or MCP calls", () => {
    render(<TraceView trace={FIXTURE_TRACE} />);

    expect(screen.getByTestId("trace-input-tokens-supervisor").textContent).toBe("—");
    expect(screen.getByTestId("trace-output-tokens-supervisor").textContent).toBe("—");
    expect(screen.getByTestId("trace-mcp-calls-supervisor").textContent).toBe("—");
  });
});

const FIXTURE_EVAL: RunEvalRecord = {
  runId: FIXTURE_TRACE.runId,
  caseId: "clinic-scheduling",
  judgedAt: "2026-01-01T00:10:00.000Z",
  evaluation: {
    overall: 4.125,
    deliverables: [
      {
        deliverable: "prd",
        judgment: {
          scores: { specificity: 4, coherence: 5, actionability: 4, completeness: 4 },
          tags: ["generic-filler"],
          evidence: "quoted line",
        },
        score: 4.25,
      },
      {
        deliverable: "userStories",
        judgment: {
          scores: { specificity: 4, coherence: 4, actionability: 4, completeness: 4 },
          tags: [],
          evidence: "quoted line",
        },
        score: 4,
      },
    ],
    missing: ["roadmap"],
    tags: ["generic-filler"],
    judgeModelId: "claude-haiku-4-5",
    costUsd: 0.0012,
  },
};

describe("TraceView quality judgment", () => {
  it("says a run wasn't judged rather than leaving the section blank — the normal case", () => {
    render(<TraceView trace={FIXTURE_TRACE} />);

    expect(screen.getByTestId("trace-unjudged")).toBeTruthy();
    expect(screen.queryByTestId("trace-quality")).toBeNull();
  });

  it("renders the overall score, the judge, the golden case, and the run's failure tags", () => {
    render(<TraceView trace={FIXTURE_TRACE} evaluation={FIXTURE_EVAL} />);

    expect(screen.getByTestId("trace-quality-overall").textContent).toBe("4.13 / 5");
    expect(screen.getByTestId("trace-quality-judge").textContent).toBe("claude-haiku-4-5");
    expect(screen.getByTestId("trace-quality-case").textContent).toBe("clinic-scheduling");
    expect(screen.getByTestId("trace-quality-tags").textContent).toBe("generic-filler");
  });

  it("renders one row per judged deliverable, with its per-dimension scores and tags", () => {
    render(<TraceView trace={FIXTURE_TRACE} evaluation={FIXTURE_EVAL} />);

    expect(screen.getByTestId("trace-quality-score-prd").textContent).toBe("4.25");
    expect(screen.getByTestId("trace-quality-tags-prd").textContent).toBe("generic-filler");
    expect(screen.getByTestId("trace-quality-tags-userStories").textContent).toBe("—");
    expect(screen.getByTestId("trace-quality-prd").textContent).toContain("5");
  });

  it("shows a deliverable the run never produced as not produced, not as a zero score", () => {
    render(<TraceView trace={FIXTURE_TRACE} evaluation={FIXTURE_EVAL} />);

    const row = screen.getByTestId("trace-quality-missing-roadmap");
    expect(row.textContent).toContain("not produced by this run");
    expect(screen.queryByTestId("trace-quality-score-roadmap")).toBeNull();
  });

  it("reports no tags as 'none' rather than an empty cell", () => {
    const clean: RunEvalRecord = {
      ...FIXTURE_EVAL,
      evaluation: { ...FIXTURE_EVAL.evaluation, tags: [], missing: [] },
    };

    render(<TraceView trace={FIXTURE_TRACE} evaluation={clean} />);

    expect(screen.getByTestId("trace-quality-tags").textContent).toBe("none");
  });
});
