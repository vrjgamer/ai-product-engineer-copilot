import { describe, it, expect } from "vitest";
import { loadGoldenSet, GoldenSetValidationError } from "./golden-set.js";
import {
  runRegression,
  assertReproducible,
  NonReproducibleConfigError,
  type EvalRunConfig,
} from "./regression.js";

describe("golden set", () => {
  it("loads a golden dataset where each case has input and a rubric", () => {
    const cases = loadGoldenSet([
      { id: "case-1", input: "Write a PRD for X", rubric: "Must include goals and metrics" },
      { id: "case-2", input: "Write a roadmap for Y", rubric: "Must be time-boxed" },
    ]);

    expect(cases).toHaveLength(2);
    expect(cases[0].input).toBe("Write a PRD for X");
    expect(cases[0].rubric).toBe("Must include goals and metrics");
  });

  it("rejects a case missing input or rubric", () => {
    expect(() => loadGoldenSet([{ id: "bad-case", input: "only input" }])).toThrow(
      GoldenSetValidationError
    );
  });
});

describe("regression runner", () => {
  it("flags any case whose score dropped below its baseline", () => {
    const cases = loadGoldenSet([
      { id: "case-1", input: "x", rubric: "y", baselineScore: 0.8 },
      { id: "case-2", input: "x", rubric: "y", baselineScore: 0.6 },
    ]);

    const findings = runRegression(cases, [
      { caseId: "case-1", score: 0.5 }, // regressed
      { caseId: "case-2", score: 0.7 }, // improved, not a regression
    ]);

    expect(findings).toEqual([{ caseId: "case-1", baselineScore: 0.8, currentScore: 0.5 }]);
  });
});

describe("reproducibility", () => {
  it("accepts a fixed-temperature-zero config and rejects a non-deterministic one", () => {
    const deterministic: EvalRunConfig = { model: "claude-sonnet-5", temperature: 0 };
    expect(() => assertReproducible(deterministic)).not.toThrow();

    const seeded: EvalRunConfig = { model: "claude-sonnet-5", temperature: 0.7, seed: 42 };
    expect(() => assertReproducible(seeded)).not.toThrow();

    const nonReproducible: EvalRunConfig = { model: "claude-sonnet-5", temperature: 0.7 };
    expect(() => assertReproducible(nonReproducible)).toThrow(NonReproducibleConfigError);
  });

  it("produces identical scores across two runs given the same inputs and a deterministic scorer", () => {
    const cases = loadGoldenSet([{ id: "case-1", input: "x", rubric: "y" }]);
    const deterministicScorer = (input: string) => input.length / 100;

    const runOnce = () => cases.map((c) => ({ caseId: c.id, score: deterministicScorer(c.input) }));

    expect(runOnce()).toEqual(runOnce());
  });
});
