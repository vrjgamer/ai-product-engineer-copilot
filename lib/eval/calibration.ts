import { judgeDeliverable, type JudgeCallFn } from "./judge";
import type { ControlCase } from "./goldenSet";
import { generateJudgeText } from "./judgeModel";
import { meanScore } from "./rubric";

export interface ControlResult {
  id: string;
  control: "good" | "bad";
  score: number;
  bound: number;
  passed: boolean;
}

export interface CalibrationResult {
  passed: boolean;
  controls: ControlResult[];
  costUsd: number;
}

/**
 * Grades the fixed control documents in `eval/golden/controls.json` and
 * checks the judge landed on the right side of each one's bound
 * (ARCHITECTURE.md §9's "LLM-as-judge with bias checks").
 *
 * This runs *before* the suite's quality numbers mean anything. A judge that
 * scores the deliberately empty PRD a 4 has a leniency bias; one that can't
 * score the deliberately specific stories above the floor is grading noise.
 * Either way the correct report is "the instrument is broken", not "quality
 * changed" — `lib/eval/gate.ts` refuses to compare against the baseline when
 * calibration fails, because a drifting judge would otherwise show up as a
 * product regression that no code change can fix.
 *
 * The bounds are deliberately loose (a wide band around the middle rather
 * than 1s and 5s): this checks that the judge can tell these two documents
 * apart at all, not that it agrees with a specific number.
 */
export async function checkCalibration(
  controls: ControlCase[],
  generate: JudgeCallFn = generateJudgeText,
): Promise<CalibrationResult> {
  const graded = await Promise.all(
    controls.map(async (control) => {
      const { judgment, costUsd } = await judgeDeliverable(
        control.deliverable,
        control.request,
        control.content,
        generate,
      );
      const score = meanScore(judgment);
      const bound =
        control.control === "good" ? (control.expectedScoreMin ?? 0) : (control.expectedScoreMax ?? 0);

      return {
        result: {
          id: control.id,
          control: control.control,
          score,
          bound,
          passed: control.control === "good" ? score >= bound : score <= bound,
        } satisfies ControlResult,
        costUsd,
      };
    }),
  );

  return {
    passed: graded.every(({ result }) => result.passed),
    controls: graded.map(({ result }) => result),
    costUsd: graded.reduce((sum, { costUsd }) => sum + costUsd, 0),
  };
}
