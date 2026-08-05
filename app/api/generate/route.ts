import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { getCheckpointer } from "../../../lib/db/checkpointer";
import { buildGraph } from "../../../lib/graph";
import { withProgressEmitter } from "../../../lib/graph/progress";
import { PROGRESS_CHUNK_TYPE, type StreamEvent } from "../../../lib/graph/streamProtocol";

// Node.js runtime, not Edge — the Postgres checkpointer and MCP servers need
// real Node APIs. `maxDuration: 300` is load-bearing (ARCHITECTURE.md §5):
// Vercel Fluid Compute's ceiling on the Hobby tier, sized for the
// PRD -> fan-out(3) -> Roadmap graph shape from TDD 0002.
export const runtime = "nodejs";
export const maxDuration = 300;

interface GenerateRequestBody {
  input?: unknown;
}

/**
 * Runs the graph from TDD 0002 (with TDD 0003's checkpointer and TDD 0004's
 * MCP-wired nodes) for one request and streams progress as it happens —
 * supervisor routing, per-node start/complete/error, MCP tool calls — via
 * the Vercel AI SDK's data-stream protocol, ending with the assembled
 * result (or a fatal-error event if the run itself couldn't complete).
 * `state.errors` entries (TDD 0002's graceful-degradation contract) travel
 * inside that final result rather than being treated as a run failure.
 */
export async function POST(req: Request): Promise<Response> {
  let body: GenerateRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input) {
    return jsonError('Request body must include a non-empty "input" string.', 400);
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const emit = (event: StreamEvent) => writer.write({ type: PROGRESS_CHUNK_TYPE, data: event });

      try {
        const graph = buildGraph({ checkpointer: getCheckpointer() });
        const threadId = globalThis.crypto.randomUUID();

        const finalState = await withProgressEmitter(emit, "supervisor", () =>
          graph.invoke({ request: input }, { configurable: { thread_id: threadId } }),
        );

        emit(
          finalState.result
            ? { type: "result", result: finalState.result }
            : { type: "fatal-error", message: "The run completed without producing a result." },
        );
      } catch (error) {
        emit({
          type: "fatal-error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
