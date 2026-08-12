import { describe, expect, it } from "vitest";

import { parseProgressStream } from "./parseProgressStream";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index]));
      index += 1;
    },
  });
}

function sseLine(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function collect<T>(iterable: AsyncGenerator<T>): Promise<T[]> {
  const results: T[] = [];
  for await (const value of iterable) results.push(value);
  return results;
}

describe("parseProgressStream", () => {
  it("yields the payload of each data-progress chunk, in order", async () => {
    const nodeStatus = { type: "node-status", node: "prdAgent", status: "running" };
    const mcpCall = { type: "mcp-call", node: "prdAgent", tool: "search_docs", status: "started" };
    const body = streamFromChunks([
      sseLine({ type: "data-progress", data: nodeStatus }) + sseLine({ type: "data-progress", data: mcpCall }),
    ]);

    const events = await collect(parseProgressStream(body));

    expect(events).toEqual([nodeStatus, mcpCall]);
  });

  it("ignores non-data-progress chunk types and the terminal [DONE] line", async () => {
    const result = { type: "result", result: { prd: null } };
    const body = streamFromChunks([
      sseLine({ type: "text-delta", delta: "ignore me" }),
      sseLine({ type: "data-progress", data: result }),
      "data: [DONE]\n\n",
    ]);

    const events = await collect(parseProgressStream(body));

    expect(events).toEqual([result]);
  });

  it("reassembles an SSE event split across multiple stream chunks", async () => {
    const event = { type: "node-status", node: "roadmapAgent", status: "completed" };
    const full = sseLine({ type: "data-progress", data: event });
    const splitPoint = Math.floor(full.length / 2);
    const body = streamFromChunks([full.slice(0, splitPoint), full.slice(splitPoint)]);

    const events = await collect(parseProgressStream(body));

    expect(events).toEqual([event]);
  });

  it("yields nothing for an empty stream", async () => {
    const body = streamFromChunks([]);

    const events = await collect(parseProgressStream(body));

    expect(events).toEqual([]);
  });

  it("yields a clarification-request as an ordinary event (TDD 0010)", async () => {
    const paused = {
      type: "clarification-request",
      runId: "run-abc",
      questions: ["Who is this for?"],
    };
    const body = streamFromChunks([sseLine({ type: "data-progress", data: paused })]);

    // A leg that ends by asking is streamed on the same channel as any other
    // event — the parser has no notion of terminal events.
    expect(await collect(parseProgressStream(body))).toEqual([paused]);
  });
});
