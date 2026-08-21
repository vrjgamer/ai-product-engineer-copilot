import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
/** `values` is optional here because TDD 0012's resume path reads the original request off the snapshot, and has to cope with a snapshot that doesn't carry one. */
type StateSnapshot = { tasks: { interrupts: unknown[] }[]; values?: { request?: unknown } };
const getState = vi.fn((..._args: unknown[]): Promise<StateSnapshot> => Promise.resolve({ tasks: [] }));
const buildGraph = vi.fn((..._args: unknown[]) => ({ invoke, getState }));
const getCheckpointer = vi.fn((..._args: unknown[]) => ({}) as never);
const checkRateLimit = vi.fn(
  (..._args: unknown[]) => Promise.resolve({ allowed: true }) as Promise<RateLimitResult>,
);
const recordRunTrace = vi.fn((..._args: unknown[]) => Promise.resolve());
const appendRunTrace = vi.fn((..._args: unknown[]) => Promise.resolve());
const recordRunResult = vi.fn((..._args: unknown[]) => Promise.resolve());
// Defaults to a valid environment so every other test in this file exercises
// route logic, not this machine's real process.env — TDD 0013's misconfigured-
// deployment behavior gets its own describe block below, which overrides this.
const validateEnv = vi.fn((..._args: unknown[]) => ({ ok: true, missing: [] as string[] }));

vi.mock("../../../lib/config/validate", () => ({
  validateEnv: (...args: unknown[]) => validateEnv(...args),
}));

vi.mock("../../../lib/graph", () => ({
  buildGraph: (...args: unknown[]) => buildGraph(...args),
}));

vi.mock("../../../lib/db/checkpointer", () => ({
  getCheckpointer: (...args: unknown[]) => getCheckpointer(...args),
}));

vi.mock("../../../lib/rate-limit/check", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

// TDD 0007: recordRunTrace is the only tracing call worth mocking here —
// buildGraph itself is mocked, so no instrumented node ever runs, and the
// real (fully synchronous, no I/O) pricing/collect modules are fine to
// exercise for real.
vi.mock("../../../lib/tracing/record", () => ({
  recordRunTrace: (...args: unknown[]) => recordRunTrace(...args),
  appendRunTrace: (...args: unknown[]) => appendRunTrace(...args),
}));

// TDD 0012: the result row is written on the same best-effort discipline as
// the trace row above, so it's mocked here for the same reason.
vi.mock("../../../lib/results/record", () => ({
  recordRunResult: (...args: unknown[]) => recordRunResult(...args),
}));

import type { StreamEvent } from "../../../lib/graph/streamProtocol";
import type { RateLimitResult } from "../../../lib/rate-limit/check";
import type { RunResult } from "../../../lib/results/record";
import type { RunTrace } from "../../../lib/tracing/record";
import { POST } from "./route";

const RESULT = {
  prd: { content: "PRD content" },
  userStories: { content: "User stories content" },
  architectureReview: { content: "Architecture review content" },
  experimentDesign: { content: "Experiment design content" },
  roadmap: { content: "Roadmap content" },
  errors: [],
};

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Reads every `data-progress` chunk's payload out of the route's SSE body — mirrors what lib/client/parseProgressStream.ts does for the browser. */
async function drainStreamEvents(response: Response): Promise<StreamEvent[]> {
  const text = await response.text();
  const events: StreamEvent[] = [];
  for (const rawEvent of text.split("\n\n")) {
    const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data:"));
    if (!dataLine) continue;
    const payload = dataLine.slice("data:".length).trim();
    if (payload === "[DONE]" || payload === "") continue;
    const chunk = JSON.parse(payload) as { type?: string; data?: unknown };
    if (chunk.type === "data-progress") events.push(chunk.data as StreamEvent);
  }
  return events;
}

describe("POST /api/generate", () => {
  beforeEach(() => {
    buildGraph.mockClear();
    getCheckpointer.mockClear();
    invoke.mockReset();
    invoke.mockResolvedValue({ result: RESULT });
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue({ allowed: true });
    validateEnv.mockReset();
    validateEnv.mockReturnValue({ ok: true, missing: [] });
    recordRunTrace.mockReset();
    recordRunTrace.mockResolvedValue(undefined);
    appendRunTrace.mockReset();
    appendRunTrace.mockResolvedValue(undefined);
    recordRunResult.mockReset();
    recordRunResult.mockResolvedValue(undefined);
    getState.mockReset();
    getState.mockResolvedValue({ tasks: [] });
  });

  it("invokes the graph from TDD 0002 with the request body's input and returns a streaming response", async () => {
    const response = await POST(postRequest({ input: "Build a todo app" }));

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(buildGraph).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(1);
    const [invokedState] = invoke.mock.calls[0] as [{ request: string }];
    expect(invokedState.request).toBe("Build a todo app");

    const events = await drainStreamEvents(response);
    const result = events.find((event) => event.type === "result");
    expect(result).toEqual({ type: "result", result: RESULT, runId: expect.any(String) });
  });

  it("records a run trace (TDD 0007) keyed by the same run id streamed in the result event", async () => {
    const response = await POST(postRequest({ input: "Build a todo app" }));
    const events = await drainStreamEvents(response);

    const result = events.find((event) => event.type === "result") as Extract<
      StreamEvent,
      { type: "result" }
    >;
    expect(recordRunTrace).toHaveBeenCalledTimes(1);
    const [trace] = recordRunTrace.mock.calls[0] as [RunTrace];
    expect(trace.runId).toBe(result.runId);
    expect(typeof trace.totalCostUsd).toBe("number");
    expect(Array.isArray(trace.nodes)).toBe(true);
  });

  it("still streams the result even when recording the run trace fails", async () => {
    recordRunTrace.mockRejectedValue(new Error("DB unreachable"));

    const response = await POST(postRequest({ input: "Build a todo app" }));
    const events = await drainStreamEvents(response);

    const result = events.find((event) => event.type === "result");
    expect(result).toEqual({ type: "result", result: RESULT, runId: expect.any(String) });
  });

  it("stores the run's result (TDD 0012) keyed by the same run id, with the request that produced it", async () => {
    const response = await POST(postRequest({ input: "Build a todo app" }));
    const events = await drainStreamEvents(response);

    const result = events.find((event) => event.type === "result") as Extract<
      StreamEvent,
      { type: "result" }
    >;
    expect(recordRunResult).toHaveBeenCalledTimes(1);
    const [stored] = recordRunResult.mock.calls[0] as [RunResult];
    expect(stored.runId).toBe(result.runId);
    expect(stored.request).toBe("Build a todo app");
    expect(stored.result).toEqual(RESULT);
    expect(new Date(stored.createdAt).toISOString()).toBe(stored.createdAt);
  });

  it("still streams the result even when storing it fails", async () => {
    // The regression this guards: a persistence bug being upgraded into a
    // failed run. Best-effort, exactly as TDD 0007's trace write is.
    recordRunResult.mockRejectedValue(new Error("DB unreachable"));

    const events = await drainStreamEvents(await POST(postRequest({ input: "Build a todo app" })));

    expect(events.find((event) => event.type === "result")).toEqual({
      type: "result",
      result: RESULT,
      runId: expect.any(String),
    });
    expect(events.find((event) => event.type === "fatal-error")).toBeUndefined();
  });

  it("stores nothing when the run itself fails", async () => {
    invoke.mockRejectedValue(new Error("checkpointer unreachable"));

    await drainStreamEvents(await POST(postRequest({ input: "Build a todo app" })));

    expect(recordRunResult).not.toHaveBeenCalled();
  });

  it("rejects a request with no input without invoking the graph", async () => {
    const response = await POST(postRequest({ input: "" }));

    expect(response.status).toBe(400);
    expect(buildGraph).not.toHaveBeenCalled();
  });

  it("rejects a request with a non-string input without invoking the graph", async () => {
    const response = await POST(postRequest({ input: 42 }));

    expect(response.status).toBe(400);
    expect(buildGraph).not.toHaveBeenCalled();
  });

  it("streams node-status progress events as the (mocked) graph reports them", async () => {
    invoke.mockImplementation(async (_state: unknown, _config: unknown) => {
      // Route handler imports emitMcpCall/withProgressEmitter for real — only
      // the graph itself is mocked, so importing the real progress module
      // here exercises the same async-local-storage plumbing the route uses.
      const { emitMcpCall } = await import("../../../lib/graph/progress");
      emitMcpCall("search_docs", "started");
      emitMcpCall("search_docs", "completed");
      return { result: RESULT };
    });

    const response = await POST(postRequest({ input: "Build a todo app" }));
    const events = await drainStreamEvents(response);

    expect(events).toEqual(
      expect.arrayContaining([
        { type: "mcp-call", node: "supervisor", tool: "search_docs", status: "started" },
        { type: "mcp-call", node: "supervisor", tool: "search_docs", status: "completed" },
      ]),
    );
  });

  it("streams a result reflecting degraded sections instead of omitting or crashing on them", async () => {
    const degraded = {
      ...RESULT,
      roadmap: { content: "Roadmap content\n\n[Note: analytics unavailable — continuing without it.]" },
      errors: [{ node: "roadmapAgent", message: "GitHub API rate-limited" }],
    };
    invoke.mockResolvedValue({ result: degraded });

    const response = await POST(postRequest({ input: "Build a todo app" }));
    const events = await drainStreamEvents(response);

    const result = events.find((event) => event.type === "result");
    expect(result).toEqual({ type: "result", result: degraded, runId: expect.any(String) });
  });

  it("streams a fatal-error event instead of throwing when the graph run itself fails", async () => {
    invoke.mockRejectedValue(new Error("checkpointer unreachable"));

    const response = await POST(postRequest({ input: "Build a todo app" }));

    expect(response.ok).toBe(true);
    const events = await drainStreamEvents(response);
    expect(events).toContainEqual({ type: "fatal-error", message: "checkpointer unreachable" });
    // The run itself never completed, so there's nothing meaningful to trace.
    expect(recordRunTrace).not.toHaveBeenCalled();
  });

  it("returns a 429 with a friendly message and retry-after when the IP is rate-limited, without invoking the graph", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 300 });

    const response = await POST(postRequest({ input: "Build a todo app" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("300");
    expect(buildGraph).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();

    const body = (await response.json()) as { error: string; retryAfterSeconds: number };
    expect(body.error).toContain("Demo rate limit reached");
    expect(body.error).toContain("5 minutes");
    expect(body.retryAfterSeconds).toBe(300);
  });

  it("checks the rate limit using the request's client IP", async () => {
    await POST(
      new Request("http://localhost/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
        body: JSON.stringify({ input: "Build a todo app" }),
      }),
    );

    expect(checkRateLimit).toHaveBeenCalledWith("203.0.113.7");
  });

  it("does not invoke the graph for a rate-limited request even with an otherwise-invalid body", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });

    const response = await POST(postRequest({ input: "" }));

    expect(response.status).toBe(429);
    expect(buildGraph).not.toHaveBeenCalled();
  });
});

/** TDD 0013: a misconfigured deployment fails once, loudly, before touching the rate limiter or the graph. */
describe("POST /api/generate — config guard", () => {
  beforeEach(() => {
    buildGraph.mockClear();
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue({ allowed: true });
    validateEnv.mockReset();
    validateEnv.mockReturnValue({ ok: true, missing: [] });
  });

  it("returns a JSON 500 naming every missing var instead of invoking the rate limiter or the graph", async () => {
    validateEnv.mockReturnValue({ ok: false, missing: ["DATABASE_URL", "RATE_LIMIT_IP_SALT"] });

    const response = await POST(postRequest({ input: "Build a todo app" }));

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("DATABASE_URL");
    expect(body.error).toContain("RATE_LIMIT_IP_SALT");
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(buildGraph).not.toHaveBeenCalled();
  });

  it("also guards a resume request, not just a fresh run", async () => {
    validateEnv.mockReturnValue({ ok: false, missing: ["DATABASE_URL"] });

    const response = await POST(postRequest({ runId: "run-1", answers: ["Designers"] }));

    expect(response.status).toBe(500);
    expect(buildGraph).not.toHaveBeenCalled();
  });

  it("returns a JSON 500 (not a bare platform 500) when the rate limiter itself throws", async () => {
    checkRateLimit.mockRejectedValue(new Error("Missing RATE_LIMIT_IP_SALT."));

    const response = await POST(postRequest({ input: "Build a todo app" }));

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("RATE_LIMIT_IP_SALT");
    expect(buildGraph).not.toHaveBeenCalled();
  });
});

/** TDD 0010: the run can end a leg by asking instead of by finishing, and be resumed with the answers. */
describe("POST /api/generate — clarifying questions", () => {
  const QUESTIONS = ["Who is this for?", "What metric does it move?"];
  const PAUSED_STATE = { result: null, __interrupt__: [{ value: { questions: QUESTIONS } }] };

  beforeEach(() => {
    buildGraph.mockClear();
    getCheckpointer.mockClear();
    invoke.mockReset();
    invoke.mockResolvedValue({ result: RESULT });
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue({ allowed: true });
    validateEnv.mockReset();
    validateEnv.mockReturnValue({ ok: true, missing: [] });
    recordRunTrace.mockReset();
    recordRunTrace.mockResolvedValue(undefined);
    appendRunTrace.mockReset();
    appendRunTrace.mockResolvedValue(undefined);
    recordRunResult.mockReset();
    recordRunResult.mockResolvedValue(undefined);
    getState.mockReset();
    getState.mockResolvedValue({
      tasks: [{ interrupts: [{ value: { questions: QUESTIONS } }] }],
      values: { request: "an app" },
    });
  });

  async function startPausedRun(): Promise<string> {
    invoke.mockResolvedValue(PAUSED_STATE);
    const events = await drainStreamEvents(await POST(postRequest({ input: "an app" })));
    const paused = events.find((event) => event.type === "clarification-request") as Extract<
      StreamEvent,
      { type: "clarification-request" }
    >;
    return paused.runId;
  }

  it("ends the first leg with a clarification-request instead of a result when the graph pauses", async () => {
    invoke.mockResolvedValue(PAUSED_STATE);

    const events = await drainStreamEvents(await POST(postRequest({ input: "an app" })));

    expect(events).toContainEqual({
      type: "clarification-request",
      runId: expect.any(String),
      questions: QUESTIONS,
    });
    expect(events.find((event) => event.type === "result")).toBeUndefined();
    // A paused leg is not a failed run.
    expect(events.find((event) => event.type === "fatal-error")).toBeUndefined();
  });

  it("resumes the same thread with the submitted answers", async () => {
    const runId = await startPausedRun();
    invoke.mockReset();
    invoke.mockResolvedValue({ result: RESULT });

    const events = await drainStreamEvents(
      await POST(postRequest({ runId, answers: ["Designers", "Weekly active projects"] })),
    );

    expect(invoke).toHaveBeenCalledTimes(1);
    const [command, config] = invoke.mock.calls[0] as [{ resume?: unknown }, { configurable: { thread_id: string } }];
    expect(command.resume).toEqual(["Designers", "Weekly active projects"]);
    expect(config.configurable.thread_id).toBe(runId);
    expect(events).toContainEqual({ type: "result", result: RESULT, runId });
  });

  it("appends the resumed leg to the run's existing trace rather than replacing it", async () => {
    await POST(postRequest({ runId: "run-1", answers: [""] }));

    expect(appendRunTrace).toHaveBeenCalledTimes(1);
    expect(recordRunTrace).not.toHaveBeenCalled();
    const [trace] = appendRunTrace.mock.calls[0] as [RunTrace];
    expect(trace.runId).toBe("run-1");
  });

  it("stores no result for a leg that paused instead of finishing", async () => {
    invoke.mockResolvedValue(PAUSED_STATE);

    await drainStreamEvents(await POST(postRequest({ input: "an app" })));

    // A row of nulls would make "unfinished" and "failed" the same state.
    expect(recordRunResult).not.toHaveBeenCalled();
  });

  it("stores the resumed run's result under the original request, taken from the checkpointed state", async () => {
    await drainStreamEvents(await POST(postRequest({ runId: "run-1", answers: ["Designers"] })));

    expect(recordRunResult).toHaveBeenCalledTimes(1);
    const [stored] = recordRunResult.mock.calls[0] as [RunResult];
    expect(stored.runId).toBe("run-1");
    // The resume body carries only answers, so the request has to come from
    // the snapshot the paused-check already fetched.
    expect(stored.request).toBe("an app");
    expect(stored.result).toEqual(RESULT);
  });

  it("does not spend a rate-limit unit on the resume — a paused run is one run", async () => {
    await POST(postRequest({ runId: "run-1", answers: ["Designers"] }));

    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("rejects a resume of a run that isn't parked at an interrupt, without invoking the graph", async () => {
    getState.mockResolvedValue({ tasks: [] });

    const response = await POST(postRequest({ runId: "already-finished", answers: ["Designers"] }));

    expect(response.status).toBe(409);
    // The guard is what makes skipping the rate-limit check safe: a finished
    // or unknown run can't be replayed to buy another graph run for free.
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rejects a resume with no runId or non-string answers without invoking the graph", async () => {
    expect((await POST(postRequest({ runId: "   ", answers: [] }))).status).toBe(400);
    expect((await POST(postRequest({ runId: "run-1", answers: "Designers" }))).status).toBe(400);
    expect((await POST(postRequest({ runId: "run-1", answers: [42] }))).status).toBe(400);
    expect((await POST(postRequest({ runId: "run-1" }))).status).toBe(400);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("accepts a resume that skips every question", async () => {
    const events = await drainStreamEvents(
      await POST(postRequest({ runId: "run-1", answers: ["", ""] })),
    );

    const [command] = invoke.mock.calls[0] as [{ resume?: unknown }];
    expect(command.resume).toEqual(["", ""]);
    expect(events).toContainEqual({ type: "result", result: RESULT, runId: "run-1" });
  });
});
