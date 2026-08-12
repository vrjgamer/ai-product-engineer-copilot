import { describe, expect, it } from "vitest";

import { DELIVERABLE_NAMES } from "./rubric";
import { loadGoldenSet, parseControlCases, parseGoldenCases } from "./goldenSet";

const VALID_CASE = {
  id: "case-1",
  request: "A thing for people",
  rationale: "because",
  expectations: [{ deliverable: "prd", mustMention: ["thing"] }],
};

const VALID_BAD_CONTROL = {
  id: "control-1",
  control: "bad",
  request: "A thing for people",
  deliverable: "prd",
  content: "words",
  rationale: "because",
  expectedScoreMax: 3,
};

describe("parseGoldenCases", () => {
  it("parses a well-formed case", () => {
    expect(parseGoldenCases([VALID_CASE])).toEqual([VALID_CASE]);
  });

  it.each([
    ["a missing id", { ...VALID_CASE, id: undefined }],
    ["a blank request", { ...VALID_CASE, request: "   " }],
    ["a deliverable that isn't one of the five", {
      ...VALID_CASE,
      expectations: [{ deliverable: "budget", mustMention: ["thing"] }],
    }],
    ["an expectation that asserts nothing", {
      ...VALID_CASE,
      expectations: [{ deliverable: "prd", mustMention: [] }],
    }],
  ])("throws on %s rather than dropping the case", (_label, malformed) => {
    expect(() => parseGoldenCases([malformed])).toThrow();
  });

  it("throws on duplicate ids, which would collide in the baseline", () => {
    expect(() => parseGoldenCases([VALID_CASE, { ...VALID_CASE, request: "other" }])).toThrow(
      /Duplicate/,
    );
  });
});

describe("parseControlCases", () => {
  it("parses a bad control with its ceiling", () => {
    expect(parseControlCases([VALID_BAD_CONTROL])[0].expectedScoreMax).toBe(3);
  });

  it("rejects a good control with no floor — it would assert nothing", () => {
    const { expectedScoreMax: _ignored, ...rest } = VALID_BAD_CONTROL;

    expect(() => parseControlCases([{ ...rest, control: "good" }])).toThrow(/expectedScoreMin/);
  });

  it("rejects a bad control with no ceiling", () => {
    const { expectedScoreMax: _ignored, ...rest } = VALID_BAD_CONTROL;

    expect(() => parseControlCases([rest])).toThrow(/expectedScoreMax/);
  });

  it("rejects a bound outside the 1–5 rubric range", () => {
    expect(() => parseControlCases([{ ...VALID_BAD_CONTROL, expectedScoreMax: 12 }])).toThrow();
  });
});

describe("the committed golden set", () => {
  it("parses, so a malformed fixture fails the mocked suite rather than the manual harness", async () => {
    const { cases, controls } = await loadGoldenSet();

    expect(cases.length).toBeGreaterThan(0);
    expect(controls.length).toBeGreaterThan(0);
  });

  it("checks the judge in both directions — leniency and severity", async () => {
    const { controls } = await loadGoldenSet();

    expect(controls.some((control) => control.control === "bad")).toBe(true);
    expect(controls.some((control) => control.control === "good")).toBe(true);
  });

  it("only expects phrases from deliverables the graph actually produces", async () => {
    const { cases } = await loadGoldenSet();

    for (const goldenCase of cases) {
      for (const expectation of goldenCase.expectations) {
        expect(DELIVERABLE_NAMES).toContain(expectation.deliverable);
      }
    }
  });
});
