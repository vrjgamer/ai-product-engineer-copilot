import type { AssembledResult } from "../graph/state";
import type { GoldenCase } from "./goldenSet";
import type { DeliverableName } from "./rubric";

export interface ExpectationResult {
  deliverable: DeliverableName;
  phrase: string;
  found: boolean;
}

/**
 * The model-free half of grading (TDD 0011): does each deliverable mention
 * the things the request made unignorable? Case-insensitive substring
 * matching, deliberately — not regex, not embeddings. A check a reader can't
 * evaluate in their head is a check nobody maintains, and a fuzzy match here
 * would reintroduce the judgement call these exist to avoid.
 *
 * A missing deliverable fails its expectations rather than skipping them: a
 * document that doesn't exist certainly doesn't mention anything.
 */
export function runExpectations(goldenCase: GoldenCase, result: AssembledResult): ExpectationResult[] {
  return goldenCase.expectations.flatMap((expectation) => {
    const content = result[expectation.deliverable]?.content?.toLowerCase() ?? "";

    return expectation.mustMention.map((phrase) => ({
      deliverable: expectation.deliverable,
      phrase,
      found: content.includes(phrase.toLowerCase()),
    }));
  });
}

export function unmetExpectations(results: ExpectationResult[]): ExpectationResult[] {
  return results.filter((result) => !result.found);
}
