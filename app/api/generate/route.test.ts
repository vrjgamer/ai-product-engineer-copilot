import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const buildGraph = vi.fn((..._args: unknown[]) => ({ invoke }));
const getCheckpointer = vi.fn((..._args: unknown[]) => ({}) as never);
const checkRateLimit = vi.fn(
  (..._args: unknown[]) => Promise.resolve({ allowed: true }) as Promise<RateLimitResult>,
);
const recordRunTrace = vi.fn((..._args: unknown[]) => Promise.resolve());

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
}));

import type { StreamEvent } from "../../../lib/graph/streamProtocol";
import type { RateLimitResult } from "../../../lib/rate-limit/check";
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
    recordRunTrace.mockReset();
    recordRunTrace.mockResolvedValue(undefined);
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
