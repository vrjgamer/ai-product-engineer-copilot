export type Winner = "A" | "B" | "tie";

export type ComparisonModel = (
  outputA: string,
  outputB: string,
  rubric: string
) => Promise<{ winner: Winner }>;

export interface BiasCheckResult {
  biased: boolean;
  forwardWinner: Winner;
  swappedWinnerNormalized: Winner;
}

/**
 * Runs the comparison both ways (A,B) and (B,A) and checks whether the
 * winner — normalized back to the original labels — flips. A judge that
 * favors "whichever came first" or "whichever is longer" fails this check
 * regardless of content quality.
 */
export async function checkPositionBias(
  model: ComparisonModel,
  outputA: string,
  outputB: string,
  rubric: string
): Promise<BiasCheckResult> {
  const forward = await model(outputA, outputB, rubric);
  const swapped = await model(outputB, outputA, rubric);

  const swappedWinnerNormalized: Winner =
    swapped.winner === "A" ? "B" : swapped.winner === "B" ? "A" : "tie";

  return {
    biased: forward.winner !== swappedWinnerNormalized,
    forwardWinner: forward.winner,
    swappedWinnerNormalized,
  };
}
