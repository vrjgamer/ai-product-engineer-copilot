import { describe, expect, it } from "vitest";

import type { CalibrationResult } from "./calibration";
import type { ExpectationResult } from "./checks";
import {
  MIN_CASE_SCORE,
  REGRESSION_TOLERANCE,
  buildBaseline,
  evaluateGate,
  type Baseline,
  type CaseResult,
  type SuiteResult,
} from "./gate";
import type { RunEvaluation } from "./judge";
import type { DeliverableName, FailureTag } from "./rubric";

const CALIBRATED: CalibrationResult = {
  passed: true,
  controls: [
    { id: "bad-generic-prd", control: "bad", score: 2, bound: 3, passed: true },
    { id: "good-specific-stories", control: "good", score: 4.2, bound: 3.5, passed: true },
  ],
  costUsd: 0.0001,
};

function evaluation(
  overall: number,
  options: { tags?: FailureTag[]; missing?: DeliverableName[] } = {},
): RunEvaluation {
  return {
    overall,
    deliverables: [],
    missing: options.missing ?? [],
    tags: options.tags ?? [],
    judgeModelId: "claude-haiku-4-5",
    costUsd: 0.0005,
  };
}

function caseResult(
  caseId: string,
  overall: number,
  options: { tags?: FailureTag[]; missing?: DeliverableName[]; expectations?: ExpectationResult[] } = {},
): CaseResult {
  return {
    caseId,
    runId: `run-${caseId}`,
    evaluation: evaluation(overall, options),
    expectations: options.expectations ?? [],
  };
}

function suite(cases: CaseResult[], calibration: CalibrationResult = CALIBRATED): SuiteResult {
  return { cases, calibration, judgeModelId: "claude-haiku-4-5", costUsd: 0.01 };
}

const BASELINE: Baseline = {
  recordedAt: "2026-08-01T00:00:00.000Z",
  judgeModelId: "claude-haiku-4-5",
  cases: {
    "clinic-scheduling": { overall: 4, tags: ["generic-filler"] },
    "warehouse-returns": { overall: 3.8, tags: [] },
  },
};

describe("evaluateGate", () => {
  it("passes a suite that clears the floor and holds its baseline", () => {
    const verdict = evaluateGate(
      suite([caseResult("clinic-scheduling", 4.1), caseResult("warehouse-returns", 3.9)]),
      BASELINE,
    );

    expect(verdict.passed).toBe(true);
    expect(verdict.failures).toEqual([]);
  });

  it("reports only calibration failures when the judge is uncalibrated, and skips the quality comparison", () => {
    const uncalibrated: CalibrationResult = {
      passed: false,
      controls: [
        { id: "bad-generic-prd", control: "bad", score: 4.5, bound: 3, passed: false },
        { id: "good-specific-stories", control: "good", score: 4.2, bound: 3.5, passed: true },
      ],
      costUsd: 0.0001,
    };

    // This case would fail the floor too — but reporting that alongside a
    // broken judge would blame the product for the grader's problem.
    const verdict = evaluateGate(suite([caseResult("clinic-scheduling", 1.2)], uncalibrated), BASELINE);

    expect(verdict.passed).toBe(false);
    expect(verdict.failures).toHaveLength(1);
    expect(verdict.failures[0].kind).toBe("calibration");
    expect(verdict.failures[0].detail).toContain("bad-generic-prd");
  });

  it("fails a case that scored below the absolute floor even when its baseline was already low", () => {
    const lowBaseline: Baseline = {
      ...BASELINE,
      cases: { "clinic-scheduling": { overall: MIN_CASE_SCORE - 0.5, tags: [] } },
    };

    const verdict = evaluateGate(suite([caseResult("clinic-scheduling", MIN_CASE_SCORE - 0.4)]), lowBaseline);

    expect(verdict.failures.map((failure) => failure.kind)).toEqual(["below-floor"]);
  });

  it("fails a case that dropped further below its baseline than the tolerance allows", () => {
    const verdict = evaluateGate(
      suite([caseResult("clinic-scheduling", 4 - REGRESSION_TOLERANCE - 0.01)]),
      BASELINE,
    );

    expect(verdict.failures.map((failure) => failure.kind)).toEqual(["regression"]);
    expect(verdict.failures[0].detail).toContain("baseline of 4.00");
  });

  it("absorbs judge noise within the tolerance instead of failing on it", () => {
    const verdict = evaluateGate(suite([caseResult("clinic-scheduling", 4 - REGRESSION_TOLERANCE)]), BASELINE);

    expect(verdict.passed).toBe(true);
  });

  it("fails a run that didn't produce one of the five deliverables", () => {
    const verdict = evaluateGate(
      suite([caseResult("clinic-scheduling", 4.5, { missing: ["roadmap"] })]),
      BASELINE,
    );

    expect(verdict.failures.map((failure) => failure.kind)).toEqual(["missing-deliverable"]);
    expect(verdict.failures[0].detail).toContain("roadmap");
  });

  it("fails an unmet deterministic expectation regardless of how well the judge scored the case", () => {
    const verdict = evaluateGate(
      suite([
        caseResult("clinic-scheduling", 5, {
          expectations: [
            { deliverable: "prd", phrase: "SMS", found: true },
            { deliverable: "architectureReview", phrase: "HIPAA", found: false },
          ],
        }),
      ]),
      BASELINE,
    );

    expect(verdict.failures.map((failure) => failure.kind)).toEqual(["expectation"]);
    expect(verdict.failures[0].detail).toContain("HIPAA");
  });

  it("notes a new failure tag without failing on it", () => {
    const verdict = evaluateGate(
      suite([caseResult("clinic-scheduling", 4.1, { tags: ["generic-filler", "unsupported-claim"] })]),
      BASELINE,
    );

    expect(verdict.passed).toBe(true);
    expect(verdict.notes.join(" ")).toContain("unsupported-claim");
  });

  it("suspends the regression check when the baseline was scored by a different judge", () => {
    const verdict = evaluateGate(
      suite([caseResult("clinic-scheduling", 3.2)]),
      { ...BASELINE, judgeModelId: "some-other-model" },
    );

    expect(verdict.passed).toBe(true);
    expect(verdict.notes.join(" ")).toContain("regression comparison skipped");
  });

  it("still enforces the floor with no baseline at all, and says one is missing", () => {
    const verdict = evaluateGate(suite([caseResult("clinic-scheduling", 2.4)]), null);

    expect(verdict.failures.map((failure) => failure.kind)).toEqual(["below-floor"]);
    expect(verdict.notes.join(" ")).toContain("No baseline");
  });

  it("notes a case the baseline has never seen instead of treating it as a regression", () => {
    const verdict = evaluateGate(suite([caseResult("campus-tutoring", 3.4)]), BASELINE);

    expect(verdict.passed).toBe(true);
    expect(verdict.notes.join(" ")).toContain("campus-tutoring");
  });
});

describe("buildBaseline", () => {
  it("snapshots each case's score and tags, keyed by case id", () => {
    const baseline = buildBaseline(
      suite([
        caseResult("clinic-scheduling", 4.126, { tags: ["unsupported-claim", "generic-filler"] }),
        caseResult("warehouse-returns", 3.75),
      ]),
      "2026-08-12T00:00:00.000Z",
    );

    expect(baseline).toEqual({
      recordedAt: "2026-08-12T00:00:00.000Z",
      judgeModelId: "claude-haiku-4-5",
      cases: {
        "clinic-scheduling": { overall: 4.13, tags: ["generic-filler", "unsupported-claim"] },
        "warehouse-returns": { overall: 3.75, tags: [] },
      },
    });
  });

  it("records the judge that produced the scores, so a later run knows whether they're comparable", () => {
    const baseline = buildBaseline(suite([caseResult("clinic-scheduling", 4)]), "2026-08-12T00:00:00.000Z");

    expect(baseline.judgeModelId).toBe("claude-haiku-4-5");
  });
});
