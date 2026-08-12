import type { AssembledResult } from "../graph/state";

/** The five deliverables a run produces — the keys of `AssembledResult` minus its `errors` bookkeeping. */
export type DeliverableName = Exclude<keyof AssembledResult, "errors">;

export const DELIVERABLE_NAMES = [
  "prd",
  "userStories",
  "architectureReview",
  "experimentDesign",
  "roadmap",
] as const satisfies readonly DeliverableName[];

/**
 * Four dimensions, scored 1–5 each, chosen so a judge can point at text for
 * every one of them. Deliberately excludes anything the judge can't see
 * evidence for (accuracy against the real world, market fit): a rubric with
 * an unanswerable dimension gets answered anyway, with noise.
 */
export const RUBRIC_DIMENSIONS = [
  "specificity",
  "coherence",
  "actionability",
  "completeness",
] as const;

export type RubricDimension = (typeof RUBRIC_DIMENSIONS)[number];

/**
 * The four-tag failure taxonomy (ARCHITECTURE.md §9). Tags are orthogonal to
 * the scores: they name *what went wrong* so a regression is diagnosable
 * ("roadmap started inventing metrics") instead of just numerically lower.
 */
export const FAILURE_TAGS = [
  "unsupported-claim",
  "missing-requirement",
  "internal-contradiction",
  "generic-filler",
] as const;

export type FailureTag = (typeof FAILURE_TAGS)[number];

export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

export interface Judgment {
  scores: Record<RubricDimension, number>;
  tags: FailureTag[];
  /** The quote the judge based its scores on — required by the prompt, and the thing that makes a bad score reviewable by a human. */
  evidence: string;
}

const DIMENSION_GUIDANCE: Record<RubricDimension, string> = {
  specificity:
    "does it commit to concrete choices (named audiences, numbers, scoped features) rather than describing any product of this type?",
  coherence:
    "is it consistent with the request and with itself — no requirement contradicted, no scope silently swapped?",
  actionability:
    "could a team act on it this week without first having to decide what it means?",
  completeness:
    "does it cover what this kind of document is for, without leaving an obvious hole?",
};

const DELIVERABLE_PURPOSE: Record<DeliverableName, string> = {
  prd: "a product requirements document",
  userStories: "a set of user stories with acceptance criteria",
  architectureReview: "an architecture review",
  experimentDesign: "an experiment design",
  roadmap: "a delivery roadmap",
};

/**
 * Judging is one deliverable per call, on purpose. Handing the judge all
 * five at once introduces position bias (whatever is first anchors the rest)
 * and lets a strong PRD carry a weak roadmap. The cost is five cheap calls
 * per run instead of one — acceptable for a harness that runs manually.
 *
 * Two anti-bias instructions are load-bearing rather than decorative: the
 * judge is told length is not quality (verbosity bias is the failure mode
 * these rubrics have), and it must quote evidence *before* scoring, so a
 * score it can't support is visibly unsupported instead of merely wrong.
 * Neither is trusted on faith — `eval/golden/` carries control cases that
 * check the judge's calibration directly (`lib/eval/calibration.ts`).
 */
export function buildJudgePrompt(input: {
  deliverable: DeliverableName;
  request: string;
  content: string;
}): { system: string; prompt: string } {
  const dimensions = RUBRIC_DIMENSIONS.map(
    (dimension) => `- ${dimension}: ${DIMENSION_GUIDANCE[dimension]}`,
  ).join("\n");

  const system = [
    `You are grading ${DELIVERABLE_PURPOSE[input.deliverable]} written in response to a product request.`,
    `Score each dimension from ${SCORE_MIN} (unusable) to ${SCORE_MAX} (could ship as written):`,
    dimensions,
    "",
    "Then tag every failure you can point at, using only these tags:",
    `- unsupported-claim: states a specific fact, metric, or user behaviour nothing supports.`,
    `- missing-requirement: ignores something the request explicitly asked for.`,
    `- internal-contradiction: conflicts with the request or with an earlier part of itself.`,
    `- generic-filler: text that would be equally true of any product in this category.`,
    "",
    "Length is not quality: a short document that decides things beats a long one that hedges.",
    "Quote the evidence you are scoring on before you score, and never score a dimension you cannot point at text for.",
    "",
    'Reply with JSON and nothing else, shaped: {"evidence": "<quote or short observation>", "scores": {' +
      RUBRIC_DIMENSIONS.map((dimension) => `"${dimension}": <number>`).join(", ") +
      '}, "tags": ["<tag>", ...]}. Use an empty tags array when you cannot point at a failure.',
  ].join("\n");

  const prompt = `Request:\n${input.request}\n\nDocument under review:\n${input.content}`;

  return { system, prompt };
}

/** Thrown when the judge's reply isn't a usable judgment. Deliberately distinct from a low score — see `lib/eval/judge.ts`. */
export class JudgeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JudgeParseError";
  }
}

interface RawJudgment {
  evidence?: unknown;
  scores?: Record<string, unknown>;
  tags?: unknown;
}

/**
 * Strict where it matters and forgiving where it doesn't. A missing or
 * out-of-range dimension score throws — that judgment is unusable and
 * silently substituting a default would quietly move the suite's numbers.
 * An unrecognized tag is dropped rather than fatal: the taxonomy is closed,
 * but a judge inventing a fifth tag alongside four valid ones hasn't
 * invalidated its scores.
 */
export function parseJudgment(raw: string): Judgment {
  const parsed = parseJsonObject(raw);
  if (!parsed) throw new JudgeParseError(`Judge reply was not JSON: ${truncate(raw)}`);

  const scores = {} as Record<RubricDimension, number>;
  for (const dimension of RUBRIC_DIMENSIONS) {
    const value = parsed.scores?.[dimension];
    const score = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(score) || score < SCORE_MIN || score > SCORE_MAX) {
      throw new JudgeParseError(
        `Judge returned no usable "${dimension}" score (got ${JSON.stringify(value)}).`,
      );
    }
    scores[dimension] = score;
  }

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.filter((tag): tag is FailureTag =>
        FAILURE_TAGS.includes(tag as FailureTag),
      )
    : [];

  return {
    scores,
    tags: [...new Set(tags)],
    evidence: typeof parsed.evidence === "string" ? parsed.evidence.trim() : "",
  };
}

/** Mirrors `supervisor.parseQuestions`' tolerance for fenced//prose-wrapped JSON — same models, same habit. */
function parseJsonObject(raw: string): RawJudgment | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? (parsed as RawJudgment) : null;
  } catch {
    return null;
  }
}

function truncate(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > 120 ? `${collapsed.slice(0, 120)}…` : collapsed;
}

/** Mean of the four dimension scores — the per-deliverable number the gate and the trace page both show. */
export function meanScore(judgment: Judgment): number {
  const total = RUBRIC_DIMENSIONS.reduce((sum, dimension) => sum + judgment.scores[dimension], 0);
  return total / RUBRIC_DIMENSIONS.length;
}
