import { describe, expect, it } from "vitest";

import type { AssembledResult } from "../graph/state";
import { runExpectations, unmetExpectations } from "./checks";
import type { GoldenCase } from "./goldenSet";

const CASE: GoldenCase = {
  id: "clinic",
  request: "A scheduling tool that cuts no-shows with SMS reminders",
  rationale: "the everyday case",
  expectations: [
    { deliverable: "prd", mustMention: ["no-show", "SMS"] },
    { deliverable: "roadmap", mustMention: ["reminder"] },
  ],
};

function resultWith(overrides: Partial<AssembledResult>): AssembledResult {
  return {
    prd: { content: "The PRD covers no-show reduction via SMS reminders." },
    userStories: { content: "stories" },
    architectureReview: { content: "review" },
    experimentDesign: { content: "experiment" },
    roadmap: { content: "Phase 1 ships the reminder pipeline." },
    errors: [],
    ...overrides,
  };
}

describe("runExpectations", () => {
  it("returns one result per phrase, not per expectation", () => {
    expect(runExpectations(CASE, resultWith({}))).toHaveLength(3);
  });

  it("matches case-insensitively", () => {
    const results = runExpectations(CASE, resultWith({ prd: { content: "no-shows drop with sms" } }));

    expect(results.filter((result) => result.deliverable === "prd").every((r) => r.found)).toBe(true);
  });

  it("reports a phrase the deliverable never mentions", () => {
    const results = runExpectations(CASE, resultWith({ roadmap: { content: "Phase 1: build it" } }));

    expect(unmetExpectations(results)).toEqual([
      { deliverable: "roadmap", phrase: "reminder", found: false },
    ]);
  });

  it("fails the expectations of a deliverable the run never produced", () => {
    const results = runExpectations(CASE, resultWith({ prd: null }));

    expect(unmetExpectations(results).map((result) => result.phrase)).toEqual(["no-show", "SMS"]);
  });

  it("only looks in the named deliverable, so a phrase in the wrong document doesn't pass", () => {
    const results = runExpectations(
      CASE,
      resultWith({ prd: { content: "nothing relevant" }, roadmap: { content: "no-show SMS reminder" } }),
    );

    expect(unmetExpectations(results).map((result) => result.phrase)).toEqual(["no-show", "SMS"]);
  });
});
