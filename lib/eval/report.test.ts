import { describe, expect, it } from "vitest";

import type { CalibrationResult } from "./calibration";
import { evaluateGate, type CaseResult, type SuiteResult } from "./gate";
import { formatSuiteReport } from "./report";

const CALIBRATION: CalibrationResult = {
  passed: true,
  controls: [
    { id: "bad-generic-prd", control: "bad", score: 2.25, bound: 3, passed: true },
    { id: "good-specific-stories", control: "good", score: 4.5, bound: 3.5, passed: true },
  ],
  costUsd: 0.0002,
};

const CASE: CaseResult = {
  caseId: "clinic-scheduling",
  runId: "run-abc",
  evaluation: {
    overall: 4,
    deliverables: [
      {
        deliverable: "prd",
        judgment: {
          scores: { specificity: 4, coherence: 4, actionability: 4, completeness: 4 },
          tags: ["generic-filler"],
          evidence: "e",
        },
        score: 4,
      },
    ],
    missing: ["roadmap"],
    tags: ["generic-filler"],
    judgeModelId: "claude-haiku-4-5",
    costUsd: 0.002,
  },
  expectations: [{ deliverable: "architectureReview", phrase: "HIPAA", found: false }],
};

const SUITE: SuiteResult = {
  cases: [CASE],
  calibration: CALIBRATION,
  judgeModelId: "claude-haiku-4-5",
  costUsd: 0.0123,
};

describe("formatSuiteReport", () => {
  it("reports the controls before the cases, so the instrument is judged before the output is", () => {
    const report = formatSuiteReport(SUITE, evaluateGate(SUITE, null));

    expect(report.indexOf("Calibration controls")).toBeLessThan(report.indexOf("Cases:"));
  });

  it("prints each case's run id, so a line can be opened at /trace/<runId>", () => {
    expect(formatSuiteReport(SUITE, evaluateGate(SUITE, null))).toContain("run run-abc");
  });

  it("shows missing deliverables, unmet expectations, failures, and the total cost", () => {
    const report = formatSuiteReport(SUITE, evaluateGate(SUITE, null));

    expect(report).toContain("roadmap");
    expect(report).toContain("MISSING");
    expect(report).toContain('never mentions "HIPAA"');
    expect(report).toContain("[missing-deliverable]");
    expect(report).toContain("$0.0123");
    expect(report.trimEnd().endsWith("FAIL")).toBe(true);
  });

  it("ends in PASS when the gate passed", () => {
    const passing: SuiteResult = {
      ...SUITE,
      cases: [{ ...CASE, evaluation: { ...CASE.evaluation, missing: [] }, expectations: [] }],
    };

    expect(formatSuiteReport(passing, evaluateGate(passing, null)).trimEnd().endsWith("PASS")).toBe(
      true,
    );
  });
});
