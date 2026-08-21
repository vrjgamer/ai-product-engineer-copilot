// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { GraphNodeView } from "./graphViewModel";
import { NodeDetail } from "./NodeDetail";

afterEach(cleanup);

describe("NodeDetail", () => {
  it("prompts for a selection when no node is selected", () => {
    render(<NodeDetail node={null} />);
    expect(screen.getByTestId("node-detail-empty")).toBeTruthy();
  });

  it("shows a selected node's latency, tokens, and MCP calls (replay data)", () => {
    const node: GraphNodeView = {
      name: "prdAgent",
      state: "completed",
      latencyMs: 842,
      inputTokens: 500,
      outputTokens: 220,
      tools: [{ tool: "search_docs", state: "completed" }],
    };
    render(<NodeDetail node={node} />);

    const detail = screen.getByTestId("node-detail");
    expect(detail.textContent).toContain("842");
    expect(detail.textContent).toContain("500");
    expect(detail.textContent).toContain("220");
    expect(detail.textContent).toContain("search_docs");
  });

  it("shows placeholders instead of blanks when latency/tokens aren't known yet (live run)", () => {
    const node: GraphNodeView = { name: "prdAgent", state: "running", tools: [] };
    render(<NodeDetail node={node} />);

    const detail = screen.getByTestId("node-detail");
    expect(detail.textContent).toContain("—");
  });

  it("shows 'none' when a node has no MCP calls at all", () => {
    const node: GraphNodeView = { name: "assembler", state: "completed", latencyMs: 12, tools: [] };
    render(<NodeDetail node={node} />);

    expect(screen.getByTestId("node-detail-mcp-calls").textContent).toContain("none");
  });
});
