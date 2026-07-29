import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "mcp-toolkit";
import { Executor, MaxStepsExceededError, StepExecutionError } from "./executor.js";
import type { Step } from "./types.js";

function makeRegistry() {
  const registry = new ToolRegistry();
  registry.register({
    name: "echo",
    inputSchema: z.object({ value: z.string() }),
    outputSchema: z.object({ value: z.string() }),
    handler: async (input) => ({ value: input.value }),
  });
  return registry;
}

describe("Executor", () => {
  it("halts on a failed step and does not execute steps queued after it", async () => {
    const registry = makeRegistry();
    const callSpy = vi.spyOn(registry, "call");

    const steps: Step[] = [
      { id: "a", kind: "tool_call", tool: "echo", args: { value: "a" }, dependsOn: [] },
      { id: "b", kind: "tool_call", tool: "nonexistent_tool", args: {}, dependsOn: ["a"] },
      { id: "c", kind: "tool_call", tool: "echo", args: { value: "c" }, dependsOn: ["b"] },
    ];

    const executor = new Executor(registry, { maxSteps: 10 });

    await expect(executor.run(steps)).rejects.toThrow(StepExecutionError);

    // "c" must never run once "b" (upstream) failed — no stale-state execution.
    expect(callSpy).toHaveBeenCalledWith("echo", { value: "a" });
    expect(callSpy).not.toHaveBeenCalledWith("echo", { value: "c" });
  });

  it("replans around a failed step instead of running the stale remaining queue", async () => {
    const registry = makeRegistry();
    const steps: Step[] = [
      { id: "a", kind: "tool_call", tool: "echo", args: { value: "a" }, dependsOn: [] },
      { id: "b", kind: "tool_call", tool: "nonexistent_tool", args: {}, dependsOn: ["a"] },
      { id: "c-stale", kind: "tool_call", tool: "echo", args: { value: "stale" }, dependsOn: ["b"] },
    ];

    const replacementStep: Step = {
      id: "c-replanned",
      kind: "tool_call",
      tool: "echo",
      args: { value: "replanned" },
      dependsOn: [],
    };

    const replan = vi.fn(async (_remaining: Step[], _failure: unknown) => [replacementStep]);

    const executor = new Executor(registry, { maxSteps: 10 });
    const { executedSteps, context } = await executor.run(steps, { replan });

    const executedIds = executedSteps.map((s) => s.id);
    expect(executedIds).toContain("a");
    expect(executedIds).toContain("c-replanned");
    expect(executedIds).not.toContain("c-stale"); // stale queue discarded, not executed
    expect(context["c-replanned"]).toEqual({ value: "replanned" });
  });

  it("terminates via the max-step guard instead of looping forever on repeated replanning", async () => {
    const registry = makeRegistry();
    const alwaysFailingStep: Step = {
      id: "fail",
      kind: "tool_call",
      tool: "nonexistent_tool",
      args: {},
      dependsOn: [],
    };

    const replan = vi.fn(async () => [{ ...alwaysFailingStep, id: `fail-${Math.random()}` }]);

    const executor = new Executor(registry, { maxSteps: 5 });

    await expect(executor.run([alwaysFailingStep], { replan })).rejects.toThrow(
      MaxStepsExceededError
    );
  });
});
