import type { GoldenCase } from "./golden-set.js";

export interface CaseScore {
  caseId: string;
  score: number;
}

export interface RegressionFinding {
  caseId: string;
  baselineScore: number;
  currentScore: number;
}

/** Flags any golden case whose current score dropped below its recorded baseline. */
export function runRegression(
  cases: GoldenCase[],
  scores: CaseScore[]
): RegressionFinding[] {
  const scoreByCaseId = new Map(scores.map((s) => [s.caseId, s.score]));
  const findings: RegressionFinding[] = [];

  for (const goldenCase of cases) {
    if (goldenCase.baselineScore === undefined) continue;
    const currentScore = scoreByCaseId.get(goldenCase.id);
    if (currentScore === undefined) continue;
    if (currentScore < goldenCase.baselineScore) {
      findings.push({
        caseId: goldenCase.id,
        baselineScore: goldenCase.baselineScore,
        currentScore,
      });
    }
  }

  return findings;
}

export interface EvalRunConfig {
  model: string;
  temperature: number;
  seed?: number;
}

export class NonReproducibleConfigError extends Error {
  constructor() {
    super("Eval run config is not reproducible: set temperature to 0 or provide a fixed seed");
    this.name = "NonReproducibleConfigError";
  }
}

export function assertReproducible(config: EvalRunConfig): void {
  if (config.temperature !== 0 && config.seed === undefined) {
    throw new NonReproducibleConfigError();
  }
}
