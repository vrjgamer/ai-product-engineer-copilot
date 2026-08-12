import { describe, expect, it } from "vitest";

import type { AssembledResult } from "../graph/state";
import { judgeDeliverable, judgeRun, type JudgeCallFn } from "./judge";
import { JudgeParseError } from "./rubric";

function reply(scores: number[], tags: string[] = []): string {
  const [specificity, coherence, actionability, completeness] = scores;
  return JSON.stringify({
    evidence: "quoted line",
    scores: { specificity, coherence, actionability, completeness },
    tags,
  });
}

/** Returns each queued reply in turn (repeating the last), recording the prompts it was called with. */
function fakeJudge(replies: string[], costPerCall = 0.0001) {
  const calls: { system: string; prompt: string }[] = [];
  let index = 0;

  const generate: JudgeCallFn = async (system, prompt) => {
    calls.push({ system, prompt });
    const text = replies[Math.min(index, replies.length - 1)];
    index += 1;
    return { text, usage: { inputTokens: 100, outputTokens: 40, costUsd: costPerCall } };
  };

  return { generate, calls };
}

const FULL_RESULT: AssembledResult = {
  prd: { content: "PRD body" },
  userStories: { content: "Stories body" },
  architectureReview: { content: "Review body" },
  experimentDesign: { content: "Experiment body" },
  roadmap: { content: "Roadmap body" },
  errors: [],
};

describe("judgeDeliverable", () => {
  it("returns the parsed judgment and the cost of the call", async () => {
    const { generate } = fakeJudge([reply([4, 4, 5, 3], ["generic-filler"])]);

    const { judgment, costUsd } = await judgeDeliverable("prd", "req", "body", generate);

    expect(judgment.scores.actionability).toBe(5);
    expect(judgment.tags).toEqual(["generic-filler"]);
    expect(costUsd).toBeCloseTo(0.0001, 10);
  });

  it("retries once when the judge replies with something unparseable, and bills both calls", async () => {
    const { generate, calls } = fakeJudge(["no thanks", reply([3, 3, 3, 3])]);

    const { judgment, costUsd } = await judgeDeliverable("prd", "req", "body", generate);

    expect(calls).toHaveLength(2);
    expect(judgment.scores.specificity).toBe(3);
    expect(costUsd).toBeCloseTo(0.0002, 10);
  });

  it("surfaces a judge that never parses as an error, not as a low score", async () => {
    const { generate } = fakeJudge(["not json", "still not json"]);

    await expect(judgeDeliverable("prd", "req", "body", generate)).rejects.toBeInstanceOf(
      JudgeParseError,
    );
  });
});

describe("judgeRun", () => {
  it("judges each deliverable in its own call, never all five in one", async () => {
    const { generate, calls } = fakeJudge([reply([4, 4, 4, 4])]);

    await judgeRun("req", FULL_RESULT, generate);

    expect(calls).toHaveLength(5);
    // Each call carries exactly one document — no cross-deliverable anchoring.
    expect(calls.filter((call) => call.prompt.includes("Roadmap body"))).toHaveLength(1);
    expect(calls.every((call) => call.prompt.includes("req"))).toBe(true);
  });

  it("averages the deliverable scores into an overall score and unions their tags", async () => {
    const { generate } = fakeJudge([
      reply([5, 5, 5, 5], ["generic-filler"]),
      reply([3, 3, 3, 3], ["generic-filler", "unsupported-claim"]),
    ]);

    const evaluation = await judgeRun("req", FULL_RESULT, generate);

    // 5 for the first deliverable, 3 for the remaining four.
    expect(evaluation.overall).toBeCloseTo((5 + 3 * 4) / 5, 10);
    expect(evaluation.tags.sort()).toEqual(["generic-filler", "unsupported-claim"]);
  });

  it("lists a deliverable the run never produced as missing instead of scoring it 1", async () => {
    const { generate, calls } = fakeJudge([reply([4, 4, 4, 4])]);

    const evaluation = await judgeRun("req", { ...FULL_RESULT, roadmap: null }, generate);

    expect(evaluation.missing).toEqual(["roadmap"]);
    expect(calls).toHaveLength(4);
    // An unwritten roadmap is an availability failure, not a 1/5 roadmap —
    // it must not drag the quality mean down.
    expect(evaluation.overall).toBe(4);
  });

  it("treats a blank deliverable the same as a missing one", async () => {
    const { generate } = fakeJudge([reply([4, 4, 4, 4])]);

    const evaluation = await judgeRun("req", { ...FULL_RESULT, prd: { content: "  " } }, generate);

    expect(evaluation.missing).toEqual(["prd"]);
  });

  it("reports overall 0 — not NaN — when a run produced nothing at all", async () => {
    const { generate } = fakeJudge([reply([4, 4, 4, 4])]);

    const evaluation = await judgeRun(
      "req",
      {
        prd: null,
        userStories: null,
        architectureReview: null,
        experimentDesign: null,
        roadmap: null,
        errors: [],
      },
      generate,
    );

    expect(evaluation.overall).toBe(0);
    expect(evaluation.missing).toHaveLength(5);
  });

  it("sums what the judging itself cost", async () => {
    const { generate } = fakeJudge([reply([4, 4, 4, 4])], 0.0002);

    const evaluation = await judgeRun("req", FULL_RESULT, generate);

    expect(evaluation.costUsd).toBeCloseTo(0.001, 10);
  });
});
