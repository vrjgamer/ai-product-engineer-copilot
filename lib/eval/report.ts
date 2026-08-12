import type { GateVerdict, SuiteResult } from "./gate";
import { unmetExpectations } from "./checks";
import { RUBRIC_DIMENSIONS } from "./rubric";

/**
 * The harness's terminal output (TDD 0011). Plain text, one line per thing
 * that happened, because the audience is whoever just ran `npm run eval`
 * before a deploy and needs to decide in ten seconds whether to ship.
 *
 * The ordering is the point: controls first (is the instrument trustworthy),
 * then per-case scores with their run IDs (so any line can be opened at
 * `/trace/<runId>`), then failures, then notes, then cost.
 */
export function formatSuiteReport(suite: SuiteResult, verdict: GateVerdict): string {
  const lines: string[] = [];

  lines.push(`Judge: ${suite.judgeModelId}`);
  lines.push("");
  lines.push("Calibration controls:");
  for (const control of suite.calibration.controls) {
    const bound = control.control === "good" ? `>= ${control.bound}` : `<= ${control.bound}`;
    lines.push(
      `  ${control.passed ? "ok  " : "FAIL"} ${control.id}: ${control.score.toFixed(2)} (expected ${bound})`,
    );
  }

  if (suite.cases.length > 0) {
    lines.push("");
    lines.push("Cases:");
    for (const result of suite.cases) {
      const { evaluation } = result;
      lines.push(`  ${result.caseId}: ${evaluation.overall.toFixed(2)}/5  (run ${result.runId})`);

      for (const entry of evaluation.deliverables) {
        const dimensions = RUBRIC_DIMENSIONS.map(
          (dimension) => `${dimension.slice(0, 4)} ${entry.judgment.scores[dimension]}`,
        ).join("  ");
        const tags = entry.judgment.tags.length > 0 ? `  [${entry.judgment.tags.join(", ")}]` : "";
        lines.push(`      ${entry.deliverable.padEnd(20)} ${entry.score.toFixed(2)}  ${dimensions}${tags}`);
      }

      for (const deliverable of evaluation.missing) {
        lines.push(`      ${deliverable.padEnd(20)} MISSING`);
      }
      for (const unmet of unmetExpectations(result.expectations)) {
        lines.push(`      unmet: ${unmet.deliverable} never mentions "${unmet.phrase}"`);
      }
      if (result.clarificationSkipped) {
        lines.push("      (paused for clarifying questions — harness skipped them, as the UI's skip button does)");
      }
    }
  }

  if (verdict.failures.length > 0) {
    lines.push("");
    lines.push("Failures:");
    for (const failure of verdict.failures) {
      lines.push(`  [${failure.kind}] ${failure.caseId ? `${failure.caseId}: ` : ""}${failure.detail}`);
    }
  }

  if (verdict.notes.length > 0) {
    lines.push("");
    lines.push("Notes:");
    for (const note of verdict.notes) lines.push(`  ${note}`);
  }

  lines.push("");
  lines.push(`Total cost (runs + judging): $${suite.costUsd.toFixed(4)}`);
  lines.push(verdict.passed ? "PASS" : "FAIL");

  return lines.join("\n");
}
