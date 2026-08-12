import { describe, expect, it } from "vitest";

import { checkCalibration } from "./calibration";
import type { ControlCase } from "./goldenSet";
import type { JudgeCallFn } from "./judge";

const CONTROLS: ControlCase[] = [
  {
    id: "bad-generic-prd",
    control: "bad",
    request: "req",
    deliverable: "prd",
    content: "filler",
    rationale: "catches leniency",
    expectedScoreMax: 3,
  },
  {
    id: "good-specific-stories",
    control: "good",
    request: "req",
    deliverable: "userStories",
    content: "specific",
    rationale: "catches severity",
    expectedScoreMin: 3.5,
  },
];

/** Scores by control id, so a test can make the judge lenient, severe, or correct. */
function judgeScoring(byContent: Record<string, number>): JudgeCallFn {
  return async (_system, prompt) => {
    const key = Object.keys(byContent).find((content) => prompt.includes(content));
    const score = key ? byContent[key] : 3;
    return {
      text: JSON.stringify({
        evidence: "e",
        scores: { specificity: score, coherence: score, actionability: score, completeness: score },
        tags: [],
      }),
      usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.00005 },
    };
  };
}

describe("checkCalibration", () => {
  it("passes when the judge puts the filler document under its ceiling and the specific one over its floor", async () => {
    const result = await checkCalibration(CONTROLS, judgeScoring({ filler: 2, specific: 4.5 }));

    expect(result.passed).toBe(true);
    expect(result.controls.map((control) => control.passed)).toEqual([true, true]);
  });

  it("fails a lenient judge — the one that scores empty text well", async () => {
    const result = await checkCalibration(CONTROLS, judgeScoring({ filler: 4, specific: 4.5 }));

    expect(result.passed).toBe(false);
    expect(result.controls.find((control) => control.id === "bad-generic-prd")).toMatchObject({
      passed: false,
      score: 4,
      bound: 3,
    });
  });

  it("fails a severe judge — the one that can't score good work above the floor", async () => {
    const result = await checkCalibration(CONTROLS, judgeScoring({ filler: 2, specific: 2 }));

    expect(result.passed).toBe(false);
    expect(result.controls.find((control) => control.id === "good-specific-stories")?.passed).toBe(
      false,
    );
  });

  it("treats the bound as inclusive on both sides", async () => {
    const result = await checkCalibration(CONTROLS, judgeScoring({ filler: 3, specific: 3.5 }));

    expect(result.passed).toBe(true);
  });

  it("reports what the calibration check itself cost", async () => {
    const result = await checkCalibration(CONTROLS, judgeScoring({ filler: 2, specific: 4.5 }));

    expect(result.costUsd).toBeCloseTo(0.0001, 10);
  });
});
