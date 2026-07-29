import type { Step } from "./types.js";

export class PlanOrderError extends Error {
  constructor(stepId: string, missingDependency: string) {
    super(
      `Step "${stepId}" depends on "${missingDependency}", which does not appear earlier in the plan`
    );
    this.name = "PlanOrderError";
  }
}

export type StepGenerator = (request: string) => Promise<Step[]>;

export class Planner {
  constructor(private readonly generate: StepGenerator) {}

  async plan(request: string): Promise<Step[]> {
    const steps = await this.generate(request);
    assertOrdered(steps);
    return steps;
  }
}

function assertOrdered(steps: Step[]): void {
  const seen = new Set<string>();
  for (const step of steps) {
    for (const dependency of step.dependsOn) {
      if (!seen.has(dependency)) {
        throw new PlanOrderError(step.id, dependency);
      }
    }
    seen.add(step.id);
  }
}
