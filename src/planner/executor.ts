import type { ToolRegistry } from "mcp-toolkit";
import type { Step } from "./types.js";

export class MaxStepsExceededError extends Error {
  constructor(maxSteps: number) {
    super(`Execution exceeded the max-step guard (${maxSteps})`);
    this.name = "MaxStepsExceededError";
  }
}

export class StepExecutionError extends Error {
  constructor(public readonly step: Step, public readonly cause: unknown) {
    super(`Step "${step.id}" failed: ${String(cause)}`);
    this.name = "StepExecutionError";
  }
}

export type Failure = { step: Step; error: unknown };

export type Replanner = (
  remaining: Step[],
  failure: Failure,
  context: Record<string, unknown>
) => Promise<Step[]>;

export interface ExecutorOptions {
  maxSteps: number;
}

export interface RunOptions {
  replan?: Replanner;
}

export interface RunResult {
  context: Record<string, unknown>;
  executedSteps: Step[];
}

export class Executor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly options: ExecutorOptions
  ) {}

  async run(initialSteps: Step[], runOptions: RunOptions = {}): Promise<RunResult> {
    let queue = [...initialSteps];
    const context: Record<string, unknown> = {};
    const executedSteps: Step[] = [];
    let stepsRun = 0;

    while (queue.length > 0) {
      if (stepsRun >= this.options.maxSteps) {
        throw new MaxStepsExceededError(this.options.maxSteps);
      }

      const step = queue.shift() as Step;
      stepsRun++;

      try {
        const result = await this.executeStep(step);
        context[step.id] = result;
        executedSteps.push(step);
      } catch (error) {
        if (!runOptions.replan) {
          throw new StepExecutionError(step, error);
        }
        // Discard the stale remaining queue — it was planned against
        // assumptions this failure just invalidated.
        const stale = queue;
        queue = await runOptions.replan(stale, { step, error }, context);
      }
    }

    return { context, executedSteps };
  }

  private async executeStep(step: Step): Promise<unknown> {
    if (step.kind === "tool_call") {
      return this.registry.call(step.tool, step.args);
    }
    throw new Error(`No executor registered for step kind "${step.kind}"`);
  }
}
