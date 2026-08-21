// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AssembledResult } from "../../lib/graph/state";
import { RunView } from "./RunView";

afterEach(cleanup);

const FULL_RESULT: AssembledResult = {
  prd: { content: "PRD content" },
  userStories: { content: "User stories content" },
  architectureReview: { content: "Architecture review content" },
  experimentDesign: { content: "Experiment design content" },
  roadmap: { content: "Roadmap content" },
  errors: [],
};

describe("RunView", () => {
  it("idle: shows a prompt to start a run and no thread/workspace chrome", () => {
    render(
      <RunView
        status="idle"
        requestText=""
        events={[]}
        result={null}
        questions={[]}
        answeredQuestions={null}
      />,
    );

    expect(screen.getByTestId("thread-idle")).toBeTruthy();
    expect(screen.queryByTestId("run-view")).toBeNull();
  });

  it("running: renders the thread above the workspace panel, no result yet", () => {
    render(
      <RunView
        status="running"
        requestText="A todo app"
        events={[]}
        result={null}
        questions={[]}
        answeredQuestions={null}
      />,
    );

    const runView = screen.getByTestId("run-view");
    const thread = screen.getByTestId("thread");
    const workspace = screen.getByTestId("workspace-panel");
    expect(thread).toBeTruthy();
    expect(workspace).toBeTruthy();
    expect(screen.queryByTestId("result-view")).toBeNull();
    // The thread comes before the workspace panel in document order — a
    // single stacked column, not a side-by-side split.
    expect(runView.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(thread.compareDocumentPosition(workspace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("done: the workspace panel shows the result", () => {
    render(
      <RunView
        status="done"
        requestText="A todo app"
        events={[]}
        result={FULL_RESULT}
        runId="run-123"
        questions={[]}
        answeredQuestions={null}
      />,
    );

    expect(screen.getByTestId("result-view")).toBeTruthy();
    expect(screen.getByTestId("run-permalink").getAttribute("href")).toBe("/run/run-123");
  });

  it("done: the workspace panel's Graph tab shows the traversal built from the run's events", () => {
    render(
      <RunView
        status="done"
        requestText="A todo app"
        events={[{ type: "node-status", node: "prdAgent", status: "completed" }]}
        result={FULL_RESULT}
        questions={[]}
        answeredQuestions={null}
      />,
    );

    fireEvent.click(screen.getByTestId("tab-graph"));
    expect(screen.getByTestId("graph-node-prdAgent").getAttribute("data-state")).toBe("completed");
  });

  it("awaiting-clarification: the clarification form is in the thread, not the workspace panel", () => {
    render(
      <RunView
        status="awaiting-clarification"
        requestText="an app"
        events={[]}
        result={null}
        questions={["Who is this for?"]}
        answeredQuestions={null}
        onAnswer={() => {}}
      />,
    );

    const thread = screen.getByTestId("thread");
    expect(thread.querySelector('[data-testid="clarification-form"]')).toBeTruthy();
    const workspace = screen.getByTestId("workspace-panel");
    expect(workspace.querySelector('[data-testid="clarification-form"]')).toBeNull();
  });

  it("error: shows a fatal-error turn in the thread instead of a result", () => {
    render(
      <RunView
        status="error"
        requestText="A todo app"
        events={[]}
        result={null}
        fatalError="checkpointer unreachable"
        questions={[]}
        answeredQuestions={null}
      />,
    );

    expect(screen.getByTestId("run-fatal-error").textContent).toContain("checkpointer unreachable");
    expect(screen.queryByTestId("result-view")).toBeNull();
  });
});
