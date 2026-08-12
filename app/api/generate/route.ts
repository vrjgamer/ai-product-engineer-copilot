import { Command } from "@langchain/langgraph";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

import { getCheckpointer } from "../../../lib/db/checkpointer";
import { buildGraph, type CompiledGraph } from "../../../lib/graph";
import { withProgressEmitter } from "../../../lib/graph/progress";
import { PROGRESS_CHUNK_TYPE, type StreamEvent } from "../../../lib/graph/streamProtocol";
import { getModelConfig } from "../../../lib/models/provider";
import { checkRateLimit } from "../../../lib/rate-limit/check";
import { getClientIp } from "../../../lib/rate-limit/getClientIp";
import { recordRunResult } from "../../../lib/results/record";
import { withRunTracing } from "../../../lib/tracing/collect";
import { computeTotalCostUsd, getPricing } from "../../../lib/tracing/pricing";
import { appendRunTrace, recordRunTrace } from "../../../lib/tracing/record";

// Node.js runtime, not Edge — the Postgres checkpointer and MCP servers need
// real Node APIs. `maxDuration: 300` is load-bearing (ARCHITECTURE.md §5):
// Vercel Fluid Compute's ceiling on the Hobby tier, sized for the
// PRD -> fan-out(3) -> Roadmap graph shape from TDD 0002.
export const runtime = "nodejs";
export const maxDuration = 300;

interface GenerateRequestBody {
  input?: unknown;
  runId?: unknown;
  answers?: unknown;
}

/**
 * Runs the graph from TDD 0002 (with TDD 0003's checkpointer and TDD 0004's
 * MCP-wired nodes) and streams progress as it happens — supervisor routing,
 * per-node start/complete/error, MCP tool calls — via the Vercel AI SDK's
 * data-stream protocol, ending with the assembled result (or a fatal-error
 * event if the run itself couldn't complete). `state.errors` entries (TDD
 * 0002's graceful-degradation contract) travel inside that final result
 * rather than being treated as a run failure.
 *
 * Two request shapes (TDD 0010), because a run can pause:
 * - `{ input }` starts a run on a fresh thread.
 * - `{ runId, answers }` resumes one parked at `clarificationGate`, which
 *   ended its first leg with a `clarification-request` event instead of a
 *   `result`.
 */
export async function POST(req: Request): Promise<Response> {
  let body: GenerateRequestBody;
  try {
    body = (await req.json()) as GenerateRequestBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  return body.runId === undefined ? startRun(req, body) : resumeRun(body);
}

async function startRun(req: Request, body: GenerateRequestBody): Promise<Response> {
  const rateLimitResult = await checkRateLimit(getClientIp(req));
  if (!rateLimitResult.allowed) {
    return rateLimitedResponse(rateLimitResult.retryAfterSeconds);
  }

  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input) {
    return jsonError('Request body must include a non-empty "input" string.', 400);
  }

  const runId = globalThis.crypto.randomUUID();
  return streamRun(
    runId,
    (graph) => graph.invoke({ request: input }, { configurable: { thread_id: runId } }),
    { request: input },
  );
}

/**
 * A resume deliberately does *not* consume a rate-limit unit: TDD 0006's
 * limiter counts runs, and a paused run is one run — charging twice would
 * halve an interrupted visitor's budget for no added protection. What makes
 * that safe is the check below: only a thread actually parked at an
 * interrupt can be resumed, so a completed or unknown `runId` can't be
 * replayed to buy another graph run for free. `runId` is a server-minted
 * UUID, so it isn't guessable either.
 */
async function resumeRun(body: GenerateRequestBody): Promise<Response> {
  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  if (!runId) {
    return jsonError('Request body\'s "runId" must be a non-empty string.', 400);
  }

  if (!Array.isArray(body.answers) || body.answers.some((answer) => typeof answer !== "string")) {
    return jsonError('Request body must include an "answers" array of strings.', 400);
  }
  const answers = body.answers as string[];

  const config = { configurable: { thread_id: runId } };
  let paused: boolean;
  // TDD 0012: the resume body carries only answers, so the request the run
  // was started from is read off the same snapshot the paused-check already
  // fetches — one checkpointer read on a path that had already paid for it.
  let request = "";
  try {
    const snapshot = await buildGraph({ checkpointer: getCheckpointer() }).getState(config);
    paused = snapshot.tasks.some((task) => (task.interrupts?.length ?? 0) > 0);
    const snapshotRequest = (snapshot.values as { request?: unknown } | undefined)?.request;
    if (typeof snapshotRequest === "string") request = snapshotRequest;
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 500);
  }

  if (!paused) {
    return jsonError("That run isn't waiting for answers — start a new one.", 409);
  }

  return streamRun(runId, (graph) => graph.invoke(new Command({ resume: answers }), config), {
    resumed: true,
    request,
  });
}

interface StreamRunOptions {
  /** A resumed leg appends to the run's existing trace row instead of replacing it (TDD 0010). */
  resumed?: boolean;
  /** The request this run answers, stored beside its result (TDD 0012). */
  request?: string;
}

/**
 * The half both request shapes share: run one leg of the graph under the
 * progress emitter and trace collector, persist the trace, then close the
 * stream with whichever terminal event the leg produced — a `result`, a
 * `clarification-request` if it parked at the gate, or a `fatal-error`.
 */
function streamRun(
  runId: string,
  invoke: (graph: CompiledGraph) => Promise<unknown>,
  { resumed = false, request = "" }: StreamRunOptions = {},
): Response {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const emit = (event: StreamEvent) => writer.write({ type: PROGRESS_CHUNK_TYPE, data: event });

      try {
        const graph = buildGraph({ checkpointer: getCheckpointer() });
        const startedAt = new Date();

        const { result: finalState, nodes } = await withRunTracing(() =>
          withProgressEmitter(emit, "supervisor", () => invoke(graph)),
        );

        // TDD 0007: one trace row per run — including a run whose state
        // carries `errors` entries (graceful degradation, not a run
        // failure), and including one that spans two legs because it paused
        // for clarifying questions. Best-effort: a tracing write failure
        // shouldn't turn a successful run into a fatal-error event.
        try {
          const { provider, modelId } = getModelConfig();
          const trace = {
            runId,
            startedAt: startedAt.toISOString(),
            endedAt: new Date().toISOString(),
            nodes,
            totalCostUsd: computeTotalCostUsd(nodes, getPricing(provider, modelId)),
          };
          await (resumed ? appendRunTrace(trace) : recordRunTrace(trace));
        } catch (tracingError) {
          console.error("Failed to record run trace", tracingError);
        }

        const terminal = terminalEvent(runId, finalState);

        // TDD 0012: a completed run's deliverables outlive the tab they were
        // streamed into, at /run/[runId]. Best-effort on the same terms as
        // the trace write above — a storage failure must not turn a run the
        // visitor is about to read into a fatal-error event. A leg that
        // paused (or failed) has no result and stores nothing.
        if (terminal.type === "result") {
          try {
            await recordRunResult({
              runId,
              request,
              createdAt: new Date().toISOString(),
              result: terminal.result,
            });
          } catch (resultError) {
            console.error("Failed to record run result", resultError);
          }
        }

        emit(terminal);
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

interface InterruptedState {
  result?: unknown;
  __interrupt__?: { value?: unknown }[];
}

/**
 * LangGraph reports a pause by returning normally with an `__interrupt__`
 * entry on the state rather than by throwing, so "did this leg finish or is
 * it waiting on the user?" is a question about the returned value, not about
 * control flow.
 */
function terminalEvent(runId: string, finalState: unknown): StreamEvent {
  const state = (finalState ?? {}) as InterruptedState;

  const questions = state.__interrupt__?.flatMap((entry) => {
    const value = entry.value as { questions?: unknown } | undefined;
    return Array.isArray(value?.questions) ? (value.questions as unknown[]) : [];
  });

  if (questions && questions.length > 0) {
    return {
      type: "clarification-request",
      runId,
      questions: questions.filter((question): question is string => typeof question === "string"),
    };
  }

  return state.result
    ? { type: "result", result: state.result as never, runId }
    : { type: "fatal-error", message: "The run completed without producing a result." };
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** TDD 0006: a clear, human-readable message plus a retry-after indication — not a bare 429. */
function rateLimitedResponse(retryAfterSeconds: number): Response {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  const message = `Demo rate limit reached — try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  return new Response(JSON.stringify({ error: message, retryAfterSeconds }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(retryAfterSeconds) },
  });
}
