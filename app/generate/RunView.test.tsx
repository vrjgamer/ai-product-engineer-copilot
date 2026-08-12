// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AssembledResult } from "../../lib/graph/state";
import type { StreamEvent } from "../../lib/graph/streamProtocol";
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
  it("idle: shows a prompt to start a run and no progress/result view", () => {
    render(<RunView status="idle" events={[]} result={null} />);

    expect(screen.getByTestId("run-idle")).toBeTruthy();
    expect(screen.queryByTestId("progress-log")).toBeNull();
    expect(screen.queryByTestId("result-view")).toBeNull();
  });

  it("running with partial progress: shows completed/running/pending nodes and the MCP call log so far, no result yet", () => {
    const events: StreamEvent[] = [
      {
        type: "node-status",
        node: "supervisor",
        status: "running",
        message: "Routing to the PRD agent first — every deliverable depends on it.",
      },
      { type: "node-status", node: "supervisor", status: "completed" },
      { type: "node-status", node: "prdAgent", status: "running" },
      { type: "mcp-call", node: "prdAgent", tool: "search_docs", status: "started" },
    ];

    render(<RunView status="running" events={events} result={null} />);

    expect(screen.getByTestId("supervisor-decision").textContent).toContain("Routing to the PRD agent");
    expect(screen.getByTestId("node-status-supervisor").getAttribute("data-status")).toBe("completed");
    expect(screen.getByTestId("node-status-prdAgent").getAttribute("data-status")).toBe("running");
    expect(screen.getByTestId("node-status-userStoryAgent").getAttribute("data-status")).toBe("pending");
    expect(screen.getByTestId("mcp-call-log").textContent).toContain("search_docs");
    expect(screen.queryByTestId("result-view")).toBeNull();
  });

  it("completed with all five sections: renders every deliverable as an undegraded tab", () => {
    render(<RunView status="done" events={[]} result={FULL_RESULT} />);

    expect(screen.getByTestId("result-view")).toBeTruthy();
    for (const key of ["prd", "userStories", "architectureReview", "experimentDesign", "roadmap"]) {
      const tab = screen.getByTestId(`tab-${key}`);
      expect(tab.getAttribute("data-degraded")).toBe("false");
    }
    // The first section (PRD) is selected by default.
    expect(screen.getByTestId("content-prd").textContent).toBe("PRD content");
  });

  it("completed with a runId: shows a 'view trace' link (TDD 0007) pointing at /trace/<runId>", () => {
    render(<RunView status="done" events={[]} result={FULL_RESULT} runId="run-123" />);

    const link = screen.getByTestId("view-trace-link");
    expect(link.getAttribute("href")).toBe("/trace/run-123");
  });

  it("completed with a runId: shows a shareable permalink (TDD 0012) pointing at /run/<runId>", () => {
    render(<RunView status="done" events={[]} result={FULL_RESULT} runId="run-123" />);

    const link = screen.getByTestId("run-permalink");
    expect(link.getAttribute("href")).toBe("/run/run-123");
  });

  it("completed with no runId yet: omits both run links instead of linking to an unknown run", () => {
    render(<RunView status="done" events={[]} result={FULL_RESULT} runId={null} />);

    expect(screen.queryByTestId("view-trace-link")).toBeNull();
    expect(screen.queryByTestId("run-permalink")).toBeNull();
  });

  it("completed with one degraded section: the degraded tab is marked and its panel shows the degraded note instead of omitting it", () => {
    const degradedResult: AssembledResult = {
      ...FULL_RESULT,
      roadmap: {
        content: "Roadmap content\n\n[Note: analytics unavailable — continuing without it.]",
      },
      errors: [{ node: "roadmapAgent", message: "GitHub API rate-limited" }],
    };

    render(<RunView status="done" events={[]} result={degradedResult} />);

    const roadmapTab = screen.getByTestId("tab-roadmap");
    expect(roadmapTab.getAttribute("data-degraded")).toBe("true");
    for (const key of ["prd", "userStories", "architectureReview", "experimentDesign"]) {
      expect(screen.getByTestId(`tab-${key}`).getAttribute("data-degraded")).toBe("false");
    }

    fireEvent.click(roadmapTab);
    expect(screen.getByTestId("content-roadmap").textContent).toContain("unavailable — continuing without it");
  });

  it("error: shows a fatal-error message instead of a partial result", () => {
    render(<RunView status="error" events={[]} result={null} fatalError="checkpointer unreachable" />);

    expect(screen.getByTestId("run-fatal-error").textContent).toContain("checkpointer unreachable");
    expect(screen.queryByTestId("result-view")).toBeNull();
  });

  it("awaiting-clarification: shows the questions alongside the progress so far, and no result", () => {
    const events: StreamEvent[] = [
      { type: "node-status", node: "supervisor", status: "completed" },
      { type: "node-status", node: "clarificationGate", status: "running" },
    ];

    render(
      <RunView
        status="awaiting-clarification"
        events={events}
        result={null}
        questions={["Who is this for?"]}
        onAnswer={() => {}}
      />,
    );

    expect(screen.getByTestId("clarification-form").textContent).toContain("Who is this for?");
    // The pause is part of the same run, so the progress log stays on screen.
    expect(screen.getByTestId("progress-log")).toBeTruthy();
    expect(screen.queryByTestId("result-view")).toBeNull();
    expect(screen.queryByTestId("run-fatal-error")).toBeNull();
  });

  it("does not list the clarification gate as a pending node on runs that never paused", () => {
    const events: StreamEvent[] = [{ type: "node-status", node: "prdAgent", status: "running" }];

    render(<RunView status="running" events={events} result={null} />);

    // A permanently "pending" row on the majority of runs would read as
    // something skipped or stuck.
    expect(screen.queryByTestId("node-status-clarificationGate")).toBeNull();
    expect(screen.getByTestId("node-status-prdAgent")).toBeTruthy();
  });

  it("lists the clarification gate once it has actually reported", () => {
    const events: StreamEvent[] = [
      { type: "node-status", node: "clarificationGate", status: "completed" },
    ];

    render(<RunView status="running" events={events} result={null} />);

    expect(
      screen.getByTestId("node-status-clarificationGate").getAttribute("data-status"),
    ).toBe("completed");
  });

  it("shows no clarification form once the run has finished", () => {
    render(<RunView status="done" events={[]} result={FULL_RESULT} questions={[]} onAnswer={() => {}} />);

    expect(screen.queryByTestId("clarification-form")).toBeNull();
    expect(screen.getByTestId("result-view")).toBeTruthy();
  });
});
