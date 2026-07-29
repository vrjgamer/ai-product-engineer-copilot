import { describe, it, expect } from "vitest";
import { Judge, JudgeOutputValidationError, verifyJudgeSanity } from "./judge.js";
import { checkPositionBias } from "./bias.js";

describe("Judge sanity anchors", () => {
  it("scores a known-good output high and a known-bad output low", async () => {
    const model = async (output: string) => ({
      score: output.includes("goals") && output.includes("metrics") ? 0.9 : 0.1,
      rationale: "checked for required rubric elements",
    });
    const judge = new Judge(model);

    const result = await verifyJudgeSanity(judge, {
      knownGood: { output: "PRD with goals and metrics defined", rubric: "must have goals and metrics" },
      knownBad: { output: "a PRD with neither", rubric: "must have goals and metrics" },
    });

    expect(result.passed).toBe(true);
    expect(result.goodScore).toBeGreaterThan(result.badScore);
  });
});

describe("Judge structured output", () => {
  it("returns a parseable, typed result with a rationale", async () => {
    const model = async () => ({ score: 0.75, rationale: "solid structure, missing risks section" });
    const judge = new Judge(model);

    const result = await judge.score("some output", "some rubric");

    expect(result.score).toBe(0.75);
    expect(result.rationale).toBe("solid structure, missing risks section");
  });

  it("rejects a malformed judge output instead of silently coercing it", async () => {
    const model = async () => ({ score: "high" as unknown as number, rationale: "no rationale schema" });
    const judge = new Judge(model);

    await expect(judge.score("output", "rubric")).rejects.toThrow(JudgeOutputValidationError);
  });
});

describe("position/verbosity bias check", () => {
  it("flags a judge that always favors whichever output comes first", async () => {
    const positionBiasedModel = async (_a: string, _b: string) => ({ winner: "A" as const });

    const result = await checkPositionBias(
      positionBiasedModel,
      "The onboarding redesign reduces signup drop-off.",
      "The onboarding redesign reduces signup drop-off.", // same content, different position
      "rubric"
    );

    expect(result.biased).toBe(true);
  });

  it("does not flag a content-based judge even when one output is padded with filler", async () => {
    const concise = "The onboarding redesign reduces signup drop-off by front-loading value.";
    const padded = `${concise} In summary, to reiterate, as previously mentioned, this is important.`;

    // Judges on substance (does it mention the core claim), ignores length/position.
    const contentAwareModel = async (a: string, b: string) => {
      const aHasClaim = a.includes("front-loading value");
      const bHasClaim = b.includes("front-loading value");
      if (aHasClaim && bHasClaim) return { winner: "tie" as const };
      return { winner: aHasClaim ? ("A" as const) : ("B" as const) };
    };

    const result = await checkPositionBias(contentAwareModel, concise, padded, "rubric");

    expect(result.biased).toBe(false);
    expect(result.forwardWinner).toBe("tie");
  });
});
