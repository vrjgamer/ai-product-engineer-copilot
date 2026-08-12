import { describe, expect, it } from "vitest";

import {
  DELIVERABLE_NAMES,
  FAILURE_TAGS,
  JudgeParseError,
  RUBRIC_DIMENSIONS,
  buildJudgePrompt,
  meanScore,
  parseJudgment,
} from "./rubric";

const VALID_REPLY = JSON.stringify({
  evidence: '"Ship weekly digest emails to studio owners"',
  scores: { specificity: 4, coherence: 5, actionability: 3, completeness: 4 },
  tags: ["generic-filler"],
});

describe("buildJudgePrompt", () => {
  it("names every rubric dimension and every failure tag so the judge scores the closed set", () => {
    const { system } = buildJudgePrompt({ deliverable: "prd", request: "r", content: "c" });

    for (const dimension of RUBRIC_DIMENSIONS) expect(system).toContain(dimension);
    for (const tag of FAILURE_TAGS) expect(system).toContain(tag);
  });

  it("carries both the request and the document, so 'missing-requirement' is judgeable at all", () => {
    const { prompt } = buildJudgePrompt({
      deliverable: "roadmap",
      request: "A scheduling tool for dental clinics",
      content: "Phase 1: onboarding",
    });

    expect(prompt).toContain("A scheduling tool for dental clinics");
    expect(prompt).toContain("Phase 1: onboarding");
  });

  it("states the anti-verbosity instruction, which is the bias this rubric actually has", () => {
    const { system } = buildJudgePrompt({ deliverable: "prd", request: "r", content: "c" });

    expect(system).toContain("Length is not quality");
  });

  it("describes the deliverable being graded, so the same rubric doesn't grade a roadmap as a PRD", () => {
    for (const deliverable of DELIVERABLE_NAMES) {
      const { system } = buildJudgePrompt({ deliverable, request: "r", content: "c" });
      expect(system.startsWith("You are grading")).toBe(true);
    }

    expect(buildJudgePrompt({ deliverable: "roadmap", request: "r", content: "c" }).system).toContain(
      "delivery roadmap",
    );
    expect(
      buildJudgePrompt({ deliverable: "userStories", request: "r", content: "c" }).system,
    ).toContain("user stories");
  });
});

describe("parseJudgment", () => {
  it("parses scores, tags, and evidence out of a clean JSON reply", () => {
    expect(parseJudgment(VALID_REPLY)).toEqual({
      scores: { specificity: 4, coherence: 5, actionability: 3, completeness: 4 },
      tags: ["generic-filler"],
      evidence: '"Ship weekly digest emails to studio owners"',
    });
  });

  it("tolerates the fences and prose models wrap JSON in", () => {
    const raw = `Here is my assessment:\n\`\`\`json\n${VALID_REPLY}\n\`\`\`\nHope that helps.`;

    expect(parseJudgment(raw).scores.coherence).toBe(5);
  });

  it("drops a tag outside the taxonomy instead of failing the whole judgment", () => {
    const raw = JSON.stringify({
      evidence: "e",
      scores: { specificity: 3, coherence: 3, actionability: 3, completeness: 3 },
      tags: ["generic-filler", "vibes-off", "missing-requirement"],
    });

    expect(parseJudgment(raw).tags).toEqual(["generic-filler", "missing-requirement"]);
  });

  it("de-duplicates repeated tags", () => {
    const raw = JSON.stringify({
      evidence: "e",
      scores: { specificity: 3, coherence: 3, actionability: 3, completeness: 3 },
      tags: ["generic-filler", "generic-filler"],
    });

    expect(parseJudgment(raw).tags).toEqual(["generic-filler"]);
  });

  it("defaults missing evidence to empty rather than throwing — the scores are still usable", () => {
    const raw = JSON.stringify({
      scores: { specificity: 3, coherence: 3, actionability: 3, completeness: 3 },
    });

    expect(parseJudgment(raw)).toEqual({
      scores: { specificity: 3, coherence: 3, actionability: 3, completeness: 3 },
      tags: [],
      evidence: "",
    });
  });

  it("throws on a missing dimension instead of substituting a default that would move the numbers", () => {
    const raw = JSON.stringify({
      evidence: "e",
      scores: { specificity: 4, coherence: 4, actionability: 4 },
      tags: [],
    });

    expect(() => parseJudgment(raw)).toThrow(JudgeParseError);
  });

  it("throws on a score outside the 1–5 range", () => {
    const raw = JSON.stringify({
      evidence: "e",
      scores: { specificity: 9, coherence: 4, actionability: 4, completeness: 4 },
      tags: [],
    });

    expect(() => parseJudgment(raw)).toThrow(/specificity/);
  });

  it("throws when the reply isn't JSON at all", () => {
    expect(() => parseJudgment("I would rather not grade this.")).toThrow(JudgeParseError);
  });
});

describe("meanScore", () => {
  it("averages the four dimensions", () => {
    expect(meanScore(parseJudgment(VALID_REPLY))).toBe(4);
  });
});
