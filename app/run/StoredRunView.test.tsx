// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AssembledResult } from "../../lib/graph/state";
import type { RunResult } from "../../lib/results/record";
import type { RunTrace } from "../../lib/tracing/record";
import { StoredRunView } from "./StoredRunView";

afterEach(cleanup);

const RESULT: AssembledResult = {
  prd: { content: "PRD content" },
  userStories: { content: "User stories content" },
  architectureReview: { content: "Architecture review content" },
  experimentDesign: { content: "Experiment design content" },
  roadmap: { content: "Roadmap content" },
  errors: [],
};

const RUN: RunResult = {
  runId: "run-1",
  request: "A tool for splitting utility bills between roommates",
  createdAt: "2026-01-01T00:00:05.000Z",
  result: RESULT,
};

const TRACE: RunTrace = {
  runId: "run-1",
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: "2026-01-01T00:00:06.500Z",
  totalCostUsd: 0.00234,
  nodes: [
    { node: "supervisor", latencyMs: 4, mcpCalls: [] },
    { node: "prdAgent", latencyMs: 820, inputTokens: 120, outputTokens: 300, mcpCalls: ["search_docs"] },
  ],
};

describe("StoredRunView", () => {
  it("renders the stored deliverables through the same ResultView the live run used", () => {
    render(<StoredRunView runId="run-1" run={RUN} trace={null} evaluation={null} />);

    expect(screen.getByTestId("result-view")).toBeTruthy();
    expect(screen.getByTestId("content-prd").textContent).toBe("PRD content");
  });

  it("shows the request the run answered, since the deliverables never restate it", () => {
    render(<StoredRunView runId="run-1" run={RUN} trace={null} evaluation={null} />);

    expect(screen.getByTestId("chat-turn-request").textContent).toContain("splitting utility bills");
  });

  it("keeps a degraded section visibly degraded rather than presenting a partial run as complete", () => {
    const degraded: RunResult = {
      ...RUN,
      result: {
        ...RESULT,
        architectureReview: null,
        errors: [{ node: "architectureReviewAgent", message: "model unavailable" }],
      },
    };

    render(<StoredRunView runId="run-1" run={degraded} trace={null} evaluation={null} />);

    fireEvent.click(screen.getByTestId("tab-architectureReview"));
    expect(screen.getByTestId("unavailable-architectureReview").textContent).toContain("model unavailable");
  });

  it("shows the graph tab's traversal when a trace is present", () => {
    render(<StoredRunView runId="run-1" run={RUN} trace={TRACE} evaluation={null} />);

    fireEvent.click(screen.getByTestId("tab-graph"));
    expect(screen.getByTestId("graph-node-prdAgent")).toBeTruthy();
    // Selecting a node surfaces its final outcome regardless of where the
    // replay animation currently is (TDD 0015: detail reflects `finalView`).
    fireEvent.click(screen.getByTestId("graph-node-prdAgent"));
    expect(screen.getByTestId("node-detail-latency").textContent).toBe("820");
  });

  it("shows a 'no trace' note on the Graph tab when there's no trace row", () => {
    render(<StoredRunView runId="run-1" run={RUN} trace={null} evaluation={null} />);

    fireEvent.click(screen.getByTestId("tab-graph"));
    expect(screen.getByTestId("graph-unavailable")).toBeTruthy();
  });

  it("shows run stats (id/timestamps/cost) when a trace is present", () => {
    render(<StoredRunView runId="run-1" run={RUN} trace={TRACE} evaluation={null} />);

    expect(screen.getByTestId("trace-run-id").textContent).toBe("run-1");
    expect(screen.getByTestId("trace-total-cost").textContent).toBe("$0.0023");
  });

  it("shows the quality section, unjudged by default", () => {
    render(<StoredRunView runId="run-1" run={RUN} trace={null} evaluation={null} />);

    expect(screen.getByTestId("trace-unjudged")).toBeTruthy();
  });

  it("renders without a saved result when only a trace exists", () => {
    render(<StoredRunView runId="run-2" run={null} trace={TRACE} evaluation={null} />);

    expect(screen.getByTestId("stored-run-no-result")).toBeTruthy();
    expect(screen.queryByTestId("result-view")).toBeNull();
    fireEvent.click(screen.getByTestId("tab-graph"));
    expect(screen.getByTestId("graph-node-prdAgent")).toBeTruthy();
  });
});
