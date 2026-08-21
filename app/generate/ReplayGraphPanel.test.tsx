// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { NodeTrace } from "../../lib/tracing/record";
import { ReplayGraphPanel } from "./ReplayGraphPanel";

afterEach(cleanup);

const NODES: NodeTrace[] = [
  { node: "supervisor", latencyMs: 100, mcpCalls: [] },
  { node: "prdAgent", latencyMs: 200, inputTokens: 400, outputTokens: 100, mcpCalls: ["search_docs"] },
];

describe("ReplayGraphPanel", () => {
  it("renders a replay control and the graph", () => {
    render(<ReplayGraphPanel traceNodes={NODES} />);

    expect(screen.getByTestId("graph-view")).toBeTruthy();
    expect(screen.getByTestId("replay-restart")).toBeTruthy();
  });

  it("selecting a node shows its final (not in-progress) latency/token detail", () => {
    render(<ReplayGraphPanel traceNodes={NODES} />);

    fireEvent.click(screen.getByTestId("graph-node-prdAgent"));

    expect(screen.getByTestId("node-detail-latency").textContent).toBe("200");
    expect(screen.getByTestId("node-detail-input-tokens").textContent).toBe("400");
  });

  it("marks a node from the run's errors as error in the detail and the graph", () => {
    render(<ReplayGraphPanel traceNodes={NODES} erroredNodes={new Set(["prdAgent"])} />);

    fireEvent.click(screen.getByTestId("graph-node-prdAgent"));

    expect(screen.getByTestId("node-detail-state").textContent).toBe("error");
  });
});
