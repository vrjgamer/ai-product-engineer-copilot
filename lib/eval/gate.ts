import type { CalibrationResult } from "./calibration";
import { unmetExpectations, type ExpectationResult } from "./checks";
import type { RunEvaluation } from "./judge";
import type { FailureTag } from "./rubric";

/** Below this, a case is bad enough that "it didn't get worse than last time" isn't a defence. */
export const MIN_CASE_SCORE = 3;

/**
 * How far a case may drop below its baseline before it counts as a
 * regression. A judge re-scoring the same document moves by a few tenths run
 * to run; a gate with zero tolerance would fail on that noise and be
 * switched off within a week, which is worse than a slightly loose gate.
 */
export const REGRESSION_TOLERANCE = 0.25;

export interface CaseResult {
  caseId: string;
  /** The run's ID — the same one used as the checkpointer thread and the `run_traces`/`run_evals` key, so a suite line is clickable through to `/trace/[runId]`. */
  runId: string;
  evaluation: RunEvaluation;
  expectations: ExpectationResult[];
  /** True when the run paused for clarifying questions (TDD 0010) and the harness skipped them, mirroring the UI's skip button. */
  clarificationSkipped?: boolean;
}

export interface SuiteResult {
  cases: CaseResult[];
  calibration: CalibrationResult;
  judgeModelId: string;
  costUsd: number;
}

export interface BaselineCase {
  overall: number;
  tags: FailureTag[];
}

export interface Baseline {
  recordedAt: string;
  judgeModelId: string;
  cases: Record<string, BaselineCase>;
}

export type GateFailureKind =
  | "calibration"
  | "missing-deliverable"
  | "expectation"
  | "below-floor"
  | "regression";

export interface GateFailure {
  kind: GateFailureKind;
  caseId?: string;
  detail: string;
}

export interface GateVerdict {
  passed: boolean;
  failures: GateFailure[];
  /** Non-failing observations worth printing: newly-appearing failure tags, cases with no baseline, a judge swap. */
  notes: string[];
}

/**
 * The regression gate (ARCHITECTURE.md §9). Five ways to fail, in the order
 * they're worth knowing about:
 *
 * 1. **Calibration** — checked first and alone. If the judge can't tell the
 *    control documents apart, every quality number below it is unreliable,
 *    so the gate reports that and stops rather than printing scores that
 *    look like product regressions.
 * 2. **A missing deliverable** — the run didn't produce one of the five.
 * 3. **An unmet expectation** — a deterministic, model-free check failed.
 * 4. **Below the floor** — a case scored under `MIN_CASE_SCORE` in absolute
 *    terms.
 * 5. **A regression** — a case dropped more than `REGRESSION_TOLERANCE`
 *    below its committed baseline.
 *
 * Newly-appearing failure tags are reported as notes, not failures: the
 * taxonomy is there to make a change diagnosable, and a tag that appears
 * while the score holds is information for a human, not a stop sign.
 */
export function evaluateGate(suite: SuiteResult, baseline: Baseline | null): GateVerdict {
  const notes: string[] = [];

  if (!suite.calibration.passed) {
    return {
      passed: false,
      failures: suite.calibration.controls
        .filter((control) => !control.passed)
        .map((control) => ({
          kind: "calibration" as const,
          detail:
            `control "${control.id}" scored ${control.score.toFixed(2)}, ` +
            `expected ${control.control === "good" ? "≥" : "≤"} ${control.bound} — ` +
            `the judge (${suite.judgeModelId}) is not calibrated, so this run's scores mean nothing`,
        })),
      notes: ["Skipped the quality comparison: fix or replace the judge first."],
    };
  }

  const failures: GateFailure[] = [];

  // Scores from two different judges aren't comparable, so a judge swap
  // suspends the regression check rather than firing it on every case.
  const comparable = baseline !== null && baseline.judgeModelId === suite.judgeModelId;
  if (baseline && !comparable) {
    notes.push(
      `Baseline was recorded with judge ${baseline.judgeModelId}, this run used ${suite.judgeModelId} — ` +
        "regression comparison skipped (re-record the baseline to compare again).",
    );
  }
  if (!baseline) {
    notes.push("No baseline found — recording one with `npm run eval -- --update-baseline` enables the regression check.");
  }

  for (const result of suite.cases) {
    const { caseId, evaluation } = result;

    for (const deliverable of evaluation.missing) {
      failures.push({
        kind: "missing-deliverable",
        caseId,
        detail: `run produced no ${deliverable}`,
      });
    }

    for (const unmet of unmetExpectations(result.expectations)) {
      failures.push({
        kind: "expectation",
        caseId,
        detail: `${unmet.deliverable} never mentions "${unmet.phrase}"`,
      });
    }

    if (evaluation.overall < MIN_CASE_SCORE) {
      failures.push({
        kind: "below-floor",
        caseId,
        detail: `scored ${evaluation.overall.toFixed(2)}, below the ${MIN_CASE_SCORE.toFixed(2)} floor`,
      });
    }

    const baselineCase = comparable ? baseline.cases[caseId] : undefined;
    if (!baselineCase) {
      if (comparable) notes.push(`Case "${caseId}" is new — no baseline to compare against.`);
      continue;
    }

    if (evaluation.overall < baselineCase.overall - REGRESSION_TOLERANCE) {
      failures.push({
        kind: "regression",
        caseId,
        detail:
          `scored ${evaluation.overall.toFixed(2)} against a baseline of ` +
          `${baselineCase.overall.toFixed(2)} (tolerance ${REGRESSION_TOLERANCE})`,
      });
    }

    const newTags = evaluation.tags.filter((tag) => !baselineCase.tags.includes(tag));
    if (newTags.length > 0) {
      notes.push(`Case "${caseId}" picked up new failure tag(s): ${newTags.join(", ")}.`);
    }
  }

  return { passed: failures.length === 0, failures, notes };
}

/** Snapshots a passing suite as the new baseline — written by `scripts/eval.ts --update-baseline` and committed. */
export function buildBaseline(suite: SuiteResult, recordedAt: string): Baseline {
  return {
    recordedAt,
    judgeModelId: suite.judgeModelId,
    cases: Object.fromEntries(
      suite.cases.map((result) => [
        result.caseId,
        { overall: round(result.evaluation.overall), tags: [...result.evaluation.tags].sort() },
      ]),
    ),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
