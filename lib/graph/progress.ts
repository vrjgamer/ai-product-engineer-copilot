import { AsyncLocalStorage } from "node:async_hooks";

import type { GraphState, GraphStateUpdate } from "./state";

export type GraphNodeName =
  | "supervisor"
  | "prdAgent"
  | "userStoryAgent"
  | "architectureReviewAgent"
  | "experimentDesignAgent"
  | "roadmapAgent"
  | "assembler";

/**
 * Per-run progress telemetry for TDD 0005's streaming route: node
 * start/complete/error and MCP tool-call start/complete/error. Deliberately
 * separate from `AssembledResult` (state.ts) — that's the run's final
 * output, this is the live commentary while it's still in flight.
 */
export type ProgressEvent =
  | {
      type: "node-status";
      node: GraphNodeName;
      status: "running" | "completed" | "error";
      message?: string;
      error?: string;
    }
  | {
      type: "mcp-call";
      node: GraphNodeName;
      tool: string;
      status: "started" | "completed" | "error";
      error?: string;
    };

export type ProgressEmitter = (event: ProgressEvent) => void;

interface ProgressContext {
  emit: ProgressEmitter;
  node: GraphNodeName;
}

const storage = new AsyncLocalStorage<ProgressContext>();

/**
 * Establishes the progress emitter for the duration of one graph run (the
 * route handler's `graph.invoke()` call). Outside of this — e.g. the
 * existing mocked node/graph test suites, which call node functions and
 * `buildGraph()` directly without a route handler — there's no context on
 * the async-local storage, so `emitMcpCall`/`withNodeProgress` below are
 * no-ops and every prior test keeps passing unmodified.
 */
export function withProgressEmitter<T>(
  emit: ProgressEmitter,
  initialNode: GraphNodeName,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run({ emit, node: initialNode }, fn);
}

/** Emits an MCP tool-call event under whichever node is currently running, per `withNodeProgress`. */
export function emitMcpCall(tool: string, status: "started" | "completed" | "error", error?: string): void {
  const context = storage.getStore();
  if (!context) return;
  context.emit({ type: "mcp-call", node: context.node, tool, status, ...(error ? { error } : {}) });
}

/**
 * Wraps a graph node function to emit start/complete/error progress and to
 * re-scope the async-local node context so nested MCP calls (mcp/tools.ts)
 * report the right node — applied centrally in `buildGraph()` so the node
 * implementations in `lib/graph/nodes/*.ts` stay untouched.
 */
export function withNodeProgress(
  node: GraphNodeName,
  fn: (state: GraphState) => Promise<GraphStateUpdate>,
): (state: GraphState) => Promise<GraphStateUpdate> {
  return async (state: GraphState) => {
    const outer = storage.getStore();
    return storage.run({ emit: outer?.emit ?? (() => {}), node }, async () => {
      if (!outer) return fn(state);

      outer.emit({
        type: "node-status",
        node,
        status: "running",
        ...(node === "supervisor"
          ? { message: "Routing to the PRD agent first — every deliverable depends on it." }
          : {}),
      });
      try {
        const update = await fn(state);
        outer.emit({ type: "node-status", node, status: "completed" });
        return update;
      } catch (error) {
        outer.emit({
          type: "node-status",
          node,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });
  };
}
