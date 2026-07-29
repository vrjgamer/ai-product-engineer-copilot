import { z } from "zod";

export const JudgeOutputSchema = z.object({
  score: z.number().min(0).max(1),
  rationale: z.string(),
  citedEvidence: z.array(z.string()).optional(),
});

export type JudgeOutput = z.infer<typeof JudgeOutputSchema>;

export class JudgeOutputValidationError extends Error {
  constructor(cause: unknown) {
    super(`Judge output is not structured/parseable: ${String(cause)}`);
    this.name = "JudgeOutputValidationError";
  }
}

/** The underlying model call — a real implementation wraps the Anthropic API; tests inject a fake. */
export type JudgeModel = (output: string, rubric: string) => Promise<unknown>;

export class Judge {
  constructor(private readonly model: JudgeModel) {}

  async score(output: string, rubric: string): Promise<JudgeOutput> {
    const raw = await this.model(output, rubric);
    const parsed = JudgeOutputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new JudgeOutputValidationError(parsed.error);
    }
    return parsed.data;
  }
}

export interface SanityAnchors {
  knownGood: { output: string; rubric: string };
  knownBad: { output: string; rubric: string };
}

/**
 * A judge that can't separate an obviously-good output from an obviously-bad
 * one has no business scoring a borderline real case — this is a
 * precondition, not a regular test.
 */
export async function verifyJudgeSanity(
  judge: Judge,
  anchors: SanityAnchors,
  threshold = 0.5
): Promise<{ passed: boolean; goodScore: number; badScore: number }> {
  const good = await judge.score(anchors.knownGood.output, anchors.knownGood.rubric);
  const bad = await judge.score(anchors.knownBad.output, anchors.knownBad.rubric);
  return {
    passed: good.score > threshold && bad.score < threshold,
    goodScore: good.score,
    badScore: bad.score,
  };
}
