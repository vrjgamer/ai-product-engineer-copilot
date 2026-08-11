// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

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
