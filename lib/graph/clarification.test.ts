import { beforeEach, describe, expect, it, vi } from "vitest";

const generateText = vi.fn();
const searchDocsTool = vi.fn();
const getRepoStatsTool = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateText(...args),
}));

vi.mock("../models/provider", () => ({
  getModel: () => ({ modelId: "mock-model" }),
}));

vi.mock("../../mcp/tools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../mcp/tools")>();
  return {
    ...actual,
    searchDocsTool: (...args: unknown[]) => searchDocsTool(...args),
    getRepoStatsTool: (...args: unknown[]) => getRepoStatsTool(...args),
  };
});

import { Command, MemorySaver } from "@langchain/langgraph";

import { buildGraph } from "./index";
import { withProgressEmitter, type ProgressEvent } from "./progress";

const FIXTURE_REPO_STATS = {
  repo: "vrjgamer/ai-product-engineer-copilot",
  stars: 10,
  openIssues: 2,
  commitVelocity: 5,
  prMergeRate: 0.8,
  fetchedAt: "2026-01-01T00:00:00.000Z",
};

const QUESTIONS = ["Who is this for?", "What's the one metric it moves?"];

/**
 * `interrupt()` requires a checkpointer, and `buildGraph()`'s default is
 * deliberately checkpointer-less (the other graph suites exercise that
 * path). An in-memory saver gives the clarified path a real, inspectable
 * thread without a Postgres dependency — the durable-across-processes half
 * is proven separately by `scripts/checkpoint-roundtrip.ts` against real
 * Postgres.
 */
function clarifyingGraph() {
  return buildGraph({ checkpointer: new MemorySaver() });
}

function config(threadId: string) {
  return { configurable: { thread_id: threadId } };
}

function interruptQuestions(state: unknown): string[] {
  const interrupts = (state as { __interrupt__?: { value?: { questions?: string[] } }[] }).__interrupt__;
  return interrupts?.flatMap((entry) => entry.value?.questions ?? []) ?? [];
}

/** Routes each node's fixture response by the unique role phrase in its system prompt (as lib/graph/index.test.ts does). */
function respondWith(supervisorReply: string) {
  return async ({ system }: { system: string }) => {
    if (system.includes("product discovery lead")) return { text: supervisorReply };
    return { text: "content" };
  };
}

describe("clarifying questions (TDD 0010)", () => {
  beforeEach(() => {
    generateText.mockReset();
    generateText.mockImplementation(respondWith(JSON.stringify(QUESTIONS)));
    searchDocsTool.mockReset();
    searchDocsTool.mockResolvedValue({ passages: [] });
    getRepoStatsTool.mockReset();
    getRepoStatsTool.mockResolvedValue(FIXTURE_REPO_STATS);
  });

  it("pauses before the PRD is written when the supervisor produces questions", async () => {
    const graph = clarifyingGraph();
    const state = await graph.invoke({ request: "an app" }, config("paused"));

    expect(interruptQuestions(state)).toEqual(QUESTIONS);
    // The pause is *before* any deliverable work — the whole point of asking.
    expect(state.prd).toBeNull();
    expect(state.result).toBeNull();
  });

  it("parks the paused run at clarificationGate in the checkpointed thread", async () => {
    const graph = clarifyingGraph();
    await graph.invoke({ request: "an app" }, config("parked"));

    const snapshot = await graph.getState(config("parked"));
    expect(snapshot.next).toEqual(["clarificationGate"]);
    expect(snapshot.tasks.flatMap((task) => task.interrupts)).toHaveLength(1);
  });

  it("completes the run when resumed, feeding the answers into prdAgent's prompt", async () => {
    const graph = clarifyingGraph();
    await graph.invoke({ request: "an app" }, config("resumed"));

    const state = await graph.invoke(
      new Command({ resume: ["Freelance designers", "Weekly active projects"] }),
      config("resumed"),
    );

    expect(state.result).not.toBeNull();
    expect(state.clarifications).toEqual([
      { question: QUESTIONS[0], answer: "Freelance designers" },
      { question: QUESTIONS[1], answer: "Weekly active projects" },
    ]);

    const prdPrompt = (generateText.mock.calls as [{ system: string; prompt: string }][]).find(
      ([call]) => call.system.includes("product manager"),
    )?.[0].prompt;
    expect(prdPrompt).toContain("Freelance designers");
    expect(prdPrompt).toContain("Weekly active projects");
  });

  it("does not re-run the supervisor's triage model call when resuming", async () => {
    const graph = clarifyingGraph();
    await graph.invoke({ request: "an app" }, config("no-retriage"));

    const triageCallsBefore = (generateText.mock.calls as [{ system: string }][]).filter(([call]) =>
      call.system.includes("product discovery lead"),
    ).length;
    await graph.invoke(new Command({ resume: ["Designers", "WAU"] }), config("no-retriage"));
    const triageCallsAfter = (generateText.mock.calls as [{ system: string }][]).filter(([call]) =>
      call.system.includes("product discovery lead"),
    ).length;

    // The gate re-runs on resume; the supervisor must not, or the run would
    // pay for triage twice and could contradict the questions just answered.
    expect(triageCallsBefore).toBe(1);
    expect(triageCallsAfter).toBe(1);
  });

  it("completes the run when the user skips every question", async () => {
    const graph = clarifyingGraph();
    await graph.invoke({ request: "an app" }, config("skipped"));

    const state = await graph.invoke(new Command({ resume: ["", "   "] }), config("skipped"));

    expect(state.result).not.toBeNull();
    // Blank answers are dropped rather than passed through as empty strings —
    // they'd be noise in prdAgent's prompt, not context.
    expect(state.clarifications).toEqual([]);
    const prdPrompt = (generateText.mock.calls as [{ system: string; prompt: string }][]).find(
      ([call]) => call.system.includes("product manager"),
    )?.[0].prompt;
    expect(prdPrompt).not.toContain("answered these clarifying questions");
  });

  it("keeps the answered questions paired with their answers when only some are answered", async () => {
    const graph = clarifyingGraph();
    await graph.invoke({ request: "an app" }, config("partial"));

    const state = await graph.invoke(new Command({ resume: ["", "Weekly retention"] }), config("partial"));

    expect(state.clarifications).toEqual([{ question: QUESTIONS[1], answer: "Weekly retention" }]);
  });

  it("runs straight through without pausing when the supervisor asks nothing", async () => {
    generateText.mockImplementation(respondWith("[]"));

    const graph = clarifyingGraph();
    const state = await graph.invoke({ request: "A very specific app" }, config("unclarified"));

    expect(interruptQuestions(state)).toEqual([]);
    expect(state.result).not.toBeNull();
    expect(state.clarifications).toEqual([]);
  });

  it("proceeds unclarified with a visible errors entry when the supervisor's triage call fails", async () => {
    generateText.mockImplementation(async ({ system }: { system: string }) => {
      if (system.includes("product discovery lead")) throw new Error("triage model unavailable");
      return { text: "content" };
    });

    const graph = clarifyingGraph();
    const state = await graph.invoke({ request: "an app" }, config("triage-failed"));

    // Degrades to v1 behaviour rather than stalling the run, but says so.
    expect(state.result).not.toBeNull();
    expect(state.errors).toEqual([{ node: "supervisor", message: "triage model unavailable" }]);
  });

  it("emits no node error event for the interrupt itself", async () => {
    const events: ProgressEvent[] = [];
    const graph = clarifyingGraph();

    await withProgressEmitter((event) => events.push(event), "supervisor", () =>
      graph.invoke({ request: "an app" }, config("progress")),
    );

    // GraphInterrupt is control flow: showing "clarificationGate: error" at
    // the moment the UI asks a question would be a lie.
    expect(events).not.toContainEqual(
      expect.objectContaining({ type: "node-status", status: "error" }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: "node-status", node: "clarificationGate", status: "running" }),
    );
  });
});
