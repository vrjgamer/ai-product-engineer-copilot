import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const buildGraph = vi.fn((..._args: unknown[]) => ({ invoke }));
const getCheckpointer = vi.fn((..._args: unknown[]) => ({}) as never);

vi.mock("../../../lib/graph", () => ({
  buildGraph: (...args: unknown[]) => buildGraph(...args),
}));

vi.mock("../../../lib/db/checkpointer", () => ({
  getCheckpointer: (...args: unknown[]) => getCheckpointer(...args),
}));

import type { StreamEvent } from "../../../lib/graph/streamProtocol";
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
    expect(result).toEqual({ type: "result", result: RESULT });
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
    expect(result).toEqual({ type: "result", result: degraded });
  });

  it("streams a fatal-error event instead of throwing when the graph run itself fails", async () => {
    invoke.mockRejectedValue(new Error("checkpointer unreachable"));

    const response = await POST(postRequest({ input: "Build a todo app" }));

    expect(response.ok).toBe(true);
    const events = await drainStreamEvents(response);
    expect(events).toContainEqual({ type: "fatal-error", message: "checkpointer unreachable" });
  });
});
