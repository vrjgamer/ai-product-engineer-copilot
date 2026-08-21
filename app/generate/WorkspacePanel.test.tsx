// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AssembledResult } from "../../lib/graph/state";
import { WorkspacePanel } from "./WorkspacePanel";

afterEach(cleanup);

const FULL_RESULT: AssembledResult = {
  prd: { content: "PRD content" },
  userStories: { content: "User stories content" },
  architectureReview: { content: "Architecture review content" },
  experimentDesign: { content: "Experiment design content" },
  roadmap: { content: "Roadmap content" },
  errors: [],
};

describe("WorkspacePanel", () => {
  it("before a result: shows an empty/working state on the Result tab, no result view", () => {
    render(<WorkspacePanel status="running" result={null} graph={<p>graph</p>} />);

    expect(screen.getByTestId("workspace-empty")).toBeTruthy();
    expect(screen.queryByTestId("result-view")).toBeNull();
  });

  it("once a result arrives: shows the result view on the Result tab", () => {
    render(<WorkspacePanel status="done" result={FULL_RESULT} graph={<p>graph</p>} />);

    expect(screen.getByTestId("result-view")).toBeTruthy();
    expect(screen.queryByTestId("workspace-empty")).toBeNull();
  });

  it("with a runId: shows a shareable permalink (TDD 0012), regardless of the selected tab", () => {
    render(<WorkspacePanel status="done" result={FULL_RESULT} runId="run-123" graph={<p>graph</p>} />);

    expect(screen.getByTestId("run-permalink").getAttribute("href")).toBe("/run/run-123");
  });

  it("with no runId yet: omits the permalink instead of linking to an unknown run", () => {
    render(<WorkspacePanel status="done" result={FULL_RESULT} runId={null} graph={<p>graph</p>} />);

    expect(screen.queryByTestId("run-permalink")).toBeNull();
  });

  it("switches to the Graph tab and renders the supplied graph content", () => {
    render(<WorkspacePanel status="running" result={null} graph={<p data-testid="stub-graph">the graph</p>} />);

    expect(screen.queryByTestId("stub-graph")).toBeNull();
    fireEvent.click(screen.getByTestId("tab-graph"));
    expect(screen.getByTestId("stub-graph")).toBeTruthy();
    expect(screen.queryByTestId("workspace-empty")).toBeNull();
  });

  it("shows a 'no trace' note on the Graph tab when no graph content is supplied", () => {
    render(<WorkspacePanel status="done" result={FULL_RESULT} />);

    fireEvent.click(screen.getByTestId("tab-graph"));
    expect(screen.getByTestId("graph-unavailable")).toBeTruthy();
  });
});
