// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { RunEvalRecord } from "../../lib/eval/record";
import { QualitySection } from "./QualitySection";

afterEach(cleanup);

const FIXTURE_EVAL: RunEvalRecord = {
  runId: "11111111-1111-1111-1111-111111111111",
  caseId: "clinic-scheduling",
  judgedAt: "2026-01-01T00:10:00.000Z",
  evaluation: {
    overall: 4.125,
    deliverables: [
      {
        deliverable: "prd",
        judgment: {
          scores: { specificity: 4, coherence: 5, actionability: 4, completeness: 4 },
          tags: ["generic-filler"],
          evidence: "quoted line",
        },
        score: 4.25,
      },
      {
        deliverable: "userStories",
        judgment: {
          scores: { specificity: 4, coherence: 4, actionability: 4, completeness: 4 },
          tags: [],
          evidence: "quoted line",
        },
        score: 4,
      },
    ],
    missing: ["roadmap"],
    tags: ["generic-filler"],
    judgeModelId: "claude-haiku-4-5",
    costUsd: 0.0012,
  },
};

describe("QualitySection", () => {
  it("says a run wasn't judged rather than leaving the section blank — the normal case", () => {
    render(<QualitySection evaluation={null} />);

    expect(screen.getByTestId("trace-unjudged")).toBeTruthy();
    expect(screen.queryByTestId("trace-quality")).toBeNull();
  });

  it("renders the overall score, the judge, the golden case, and the run's failure tags", () => {
    render(<QualitySection evaluation={FIXTURE_EVAL} />);

    expect(screen.getByTestId("trace-quality-overall").textContent).toBe("4.13 / 5");
    expect(screen.getByTestId("trace-quality-judge").textContent).toBe("claude-haiku-4-5");
    expect(screen.getByTestId("trace-quality-case").textContent).toBe("clinic-scheduling");
    expect(screen.getByTestId("trace-quality-tags").textContent).toBe("generic-filler");
  });

  it("renders one row per judged deliverable, with its per-dimension scores and tags", () => {
    render(<QualitySection evaluation={FIXTURE_EVAL} />);

    expect(screen.getByTestId("trace-quality-score-prd").textContent).toBe("4.25");
    expect(screen.getByTestId("trace-quality-tags-prd").textContent).toBe("generic-filler");
    expect(screen.getByTestId("trace-quality-tags-userStories").textContent).toBe("—");
    expect(screen.getByTestId("trace-quality-prd").textContent).toContain("5");
  });

  it("shows a deliverable the run never produced as not produced, not as a zero score", () => {
    render(<QualitySection evaluation={FIXTURE_EVAL} />);

    const row = screen.getByTestId("trace-quality-missing-roadmap");
    expect(row.textContent).toContain("not produced by this run");
    expect(screen.queryByTestId("trace-quality-score-roadmap")).toBeNull();
  });

  it("reports no tags as 'none' rather than an empty cell", () => {
    const clean: RunEvalRecord = {
      ...FIXTURE_EVAL,
      evaluation: { ...FIXTURE_EVAL.evaluation, tags: [], missing: [] },
    };

    render(<QualitySection evaluation={clean} />);

    expect(screen.getByTestId("trace-quality-tags").textContent).toBe("none");
  });
});
