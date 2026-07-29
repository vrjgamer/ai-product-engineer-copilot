import { describe, it, expect, vi } from "vitest";
import { Planner, PlanOrderError } from "./planner.js";
import type { Step } from "./types.js";

describe("Planner", () => {
  it("emits an ordered step list before any execution happens", async () => {
    const executed: string[] = [];
    const steps: Step[] = [
      { id: "s1", kind: "generate", section: "problem_statement", dependsOn: [] },
      { id: "s2", kind: "generate", section: "goals", dependsOn: ["s1"] },
    ];

    const generate = vi.fn(async (_request: string) => {
      // Planning must not execute steps — only describe them.
      return steps;
    });

    const planner = new Planner(generate);
    const plan = await planner.plan("Write a PRD for a new onboarding flow");

    expect(plan).toEqual(steps);
    expect(executed).toEqual([]); // nothing executed during planning
    expect(generate).toHaveBeenCalledWith("Write a PRD for a new onboarding flow");
  });

  it("rejects a plan where a step depends on a step that comes later", async () => {
    const outOfOrder: Step[] = [
      { id: "s1", kind: "generate", section: "goals", dependsOn: ["s2"] },
      { id: "s2", kind: "generate", section: "problem_statement", dependsOn: [] },
    ];
    const planner = new Planner(async () => outOfOrder);

    await expect(planner.plan("request")).rejects.toThrow(PlanOrderError);
  });
});
