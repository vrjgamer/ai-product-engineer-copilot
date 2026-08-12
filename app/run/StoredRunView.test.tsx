// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AssembledResult } from "../../lib/graph/state";
import type { RunResult } from "../../lib/results/record";
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

describe("StoredRunView", () => {
  it("renders the stored deliverables through the same ResultView the live run used", () => {
    render(<StoredRunView run={RUN} />);

    expect(screen.getByTestId("result-view")).toBeTruthy();
    expect(screen.getByTestId("content-prd").textContent).toBe("PRD content");
  });

  it("shows the request the run answered, since the deliverables never restate it", () => {
    render(<StoredRunView run={RUN} />);

    expect(screen.getByTestId("stored-run-request").textContent).toContain(
      "splitting utility bills",
    );
  });

  it("links to the run's trace", () => {
    render(<StoredRunView run={RUN} />);

    expect(screen.getByTestId("view-trace-link").getAttribute("href")).toBe("/trace/run-1");
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

    render(<StoredRunView run={degraded} />);

    fireEvent.click(screen.getByTestId("tab-architectureReview"));
    expect(screen.getByTestId("unavailable-architectureReview").textContent).toContain(
      "model unavailable",
    );
  });
});
