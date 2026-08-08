import { AsyncLocalStorage } from "node:async_hooks";

import type { NodeTrace } from "./record";

interface RunCollector {
  nodes: NodeTrace[];
}

interface NodeContext {
  collector: RunCollector;
  node: string;
  startedAt: number;
  mcpCalls: string[];
  inputTokens?: number;
  outputTokens?: number;
}

const storage = new AsyncLocalStorage<NodeContext>();

/**
 * Establishes a trace collector for the duration of one graph run and
 * returns the per-node traces accumulated by `withNodeTracing` while `fn`
 * ran. Independent of lib/graph/progress.ts's AsyncLocalStorage (that one
 * carries the SSE progress emitter; this one carries trace data) — both
 * wrap the same node calls, from `buildGraph()` in lib/graph/index.ts.
 */
export async function withRunTracing<T>(fn: () => Promise<T>): Promise<{ result: T; nodes: NodeTrace[] }> {
  const collector: RunCollector = { nodes: [] };
  const rootContext: NodeContext = { collector, node: "", startedAt: Date.now(), mcpCalls: [] };
  const result = await storage.run(rootContext, fn);
  return { result, nodes: collector.nodes };
}

/**
 * Wraps a graph node function to time it and, on completion (success or
 * throw — TDD 0007: a run with `state.errors` entries still gets a
 * complete trace), append a `NodeTrace` to the enclosing run's collector.
 * A no-op passthrough outside `withRunTracing` (e.g. the existing mocked
 * node/graph test suites that call node functions or `buildGraph()`
 * directly without wrapping the call), mirroring `withNodeProgress`.
 */
export async function withNodeTracing<T>(node: string, fn: () => Promise<T>): Promise<T> {
  const outer = storage.getStore();
  if (!outer) return fn();

  const startedAt = Date.now();
  return storage.run({ collector: outer.collector, node, startedAt, mcpCalls: [] }, async () => {
    try {
      return await fn();
    } finally {
      finalizeNodeTrace(startedAt);
    }
  });
}

function finalizeNodeTrace(startedAt: number): void {
  const context = storage.getStore();
  if (!context) return;
  context.collector.nodes.push({
    node: context.node,
    latencyMs: Date.now() - startedAt,
    ...(context.inputTokens !== undefined ? { inputTokens: context.inputTokens } : {}),
    ...(context.outputTokens !== undefined ? { outputTokens: context.outputTokens } : {}),
    mcpCalls: context.mcpCalls,
  });
}

/** Adds to the current node's token counts — called from lib/graph/nodes/shared.ts after a model call resolves. A no-op outside `withRunTracing`/`withNodeTracing`. */
export function recordTokenUsage(inputTokens: number | undefined, outputTokens: number | undefined): void {
  const context = storage.getStore();
  if (!context) return;
  if (inputTokens !== undefined) context.inputTokens = (context.inputTokens ?? 0) + inputTokens;
  if (outputTokens !== undefined) context.outputTokens = (context.outputTokens ?? 0) + outputTokens;
}

/** Records that the current node called an MCP tool — called from mcp/tools.ts. A no-op outside `withRunTracing`/`withNodeTracing`. */
export function recordMcpCall(tool: string): void {
  const context = storage.getStore();
  if (!context) return;
  context.mcpCalls.push(tool);
}
