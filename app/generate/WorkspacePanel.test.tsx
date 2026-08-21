// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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
  it("before a result: shows an empty/working state, no result view", () => {
    render(<WorkspacePanel status="running" result={null} />);

    expect(screen.getByTestId("workspace-empty")).toBeTruthy();
    expect(screen.queryByTestId("result-view")).toBeNull();
  });

  it("once a result arrives: shows the result view", () => {
    render(<WorkspacePanel status="done" result={FULL_RESULT} />);

    expect(screen.getByTestId("result-view")).toBeTruthy();
    expect(screen.queryByTestId("workspace-empty")).toBeNull();
  });

  it("with a runId: shows a 'view trace' link (TDD 0007) and a shareable permalink (TDD 0012)", () => {
    render(<WorkspacePanel status="done" result={FULL_RESULT} runId="run-123" />);

    expect(screen.getByTestId("view-trace-link").getAttribute("href")).toBe("/trace/run-123");
    expect(screen.getByTestId("run-permalink").getAttribute("href")).toBe("/run/run-123");
  });

  it("with no runId yet: omits both run links instead of linking to an unknown run", () => {
    render(<WorkspacePanel status="done" result={FULL_RESULT} runId={null} />);

    expect(screen.queryByTestId("view-trace-link")).toBeNull();
    expect(screen.queryByTestId("run-permalink")).toBeNull();
  });
});
