// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GraphViewState } from "./graphViewModel";
import { GraphView } from "./GraphView";

afterEach(cleanup);

function baseViewState(overrides: Partial<Record<string, unknown>> = {}): GraphViewState {
  const names = [
    "supervisor",
    "clarificationGate",
    "prdAgent",
    "userStoryAgent",
    "architectureReviewAgent",
    "experimentDesignAgent",
    "roadmapAgent",
    "assembler",
  ] as const;
  return {
    nodes: names.map((name) => ({
      name,
      state: "pending",
      tools: [],
      ...(overrides[name] ?? {}),
    })),
  } as GraphViewState;
}

describe("GraphView", () => {
  it("renders all eight nodes with their state as a data attribute", () => {
    const view = baseViewState({ prdAgent: { state: "running" } });
    render(<GraphView viewState={view} selectedNode={null} onSelectNode={() => {}} />);

    expect(screen.getByTestId("graph-node-supervisor").getAttribute("data-state")).toBe("pending");
    expect(screen.getByTestId("graph-node-prdAgent").getAttribute("data-state")).toBe("running");
  });

  it("renders a tool-call leaf only once it has appeared", () => {
    const view = baseViewState({
      prdAgent: { state: "running", tools: [{ tool: "search_docs", state: "started" }] },
    });
    render(<GraphView viewState={view} selectedNode={null} onSelectNode={() => {}} />);

    expect(screen.getByTestId("graph-tool-prdAgent-search_docs")).toBeTruthy();
    expect(screen.queryByTestId("graph-tool-userStoryAgent-search_docs")).toBeNull();
  });

  it("shows a degraded tool call distinctly (data-state=error), not hidden", () => {
    const view = baseViewState({
      architectureReviewAgent: {
        state: "completed",
        tools: [{ tool: "get_repo_stats", state: "error" }],
      },
    });
    render(<GraphView viewState={view} selectedNode={null} onSelectNode={() => {}} />);

    expect(
      screen.getByTestId("graph-tool-architectureReviewAgent-get_repo_stats").getAttribute("data-state"),
    ).toBe("error");
  });

  it("calls onSelectNode when a node is clicked", () => {
    const onSelectNode = vi.fn();
    const view = baseViewState();
    render(<GraphView viewState={view} selectedNode={null} onSelectNode={onSelectNode} />);

    fireEvent.click(screen.getByTestId("graph-node-roadmapAgent"));

    expect(onSelectNode).toHaveBeenCalledWith("roadmapAgent");
  });

  it("marks the selected node distinctly", () => {
    const view = baseViewState();
    render(<GraphView viewState={view} selectedNode="prdAgent" onSelectNode={() => {}} />);

    expect(screen.getByTestId("graph-node-prdAgent").getAttribute("data-selected")).toBe("true");
    expect(screen.getByTestId("graph-node-roadmapAgent").getAttribute("data-selected")).toBe("false");
  });

  it("provides an offscreen text-equivalent list of every node and its state", () => {
    const view = baseViewState({ prdAgent: { state: "completed" } });
    render(<GraphView viewState={view} selectedNode={null} onSelectNode={() => {}} />);

    const list = screen.getByTestId("graph-text-equivalent");
    expect(list.textContent).toContain("PRD");
    expect(list.textContent).toContain("completed");
  });

  it("marks unreached nodes as aborted rather than still-running when the run ended in a fatal error", () => {
    const view = baseViewState();
    render(<GraphView viewState={view} selectedNode={null} onSelectNode={() => {}} aborted />);

    expect(screen.getByTestId("graph-node-roadmapAgent").getAttribute("data-aborted")).toBe("true");
  });
});
