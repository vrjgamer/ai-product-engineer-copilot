import { generateText } from "ai";

import { getModel } from "../../models/provider";
import { recordTokenUsage } from "../../tracing/collect";
import type { NodeError } from "../state";

/** Real token counts, not estimates (TDD 0007, ARCHITECTURE.md §7) — recorded from the AI SDK's own `result.usage`, not computed after the fact. */
export async function generateNodeText(system: string, prompt: string): Promise<string> {
  const { text, usage } = await generateText({ model: getModel(), system, prompt });
  recordTokenUsage(usage?.inputTokens, usage?.outputTokens);
  return text;
}

export function toNodeError(node: string, error: unknown): NodeError {
  return { node, message: error instanceof Error ? error.message : String(error) };
}

export interface ToolAttempt<T> {
  value: T | null;
  error: NodeError | null;
}

/**
 * Runs an MCP tool call (TDD 0004) and converts a throw into a `NodeError`
 * instead of letting it propagate — the graceful-degradation contract from
 * ARCHITECTURE.md §3: an MCP failure must not crash the node, only degrade
 * its output.
 */
export async function tryTool<T>(node: string, call: () => Promise<T>): Promise<ToolAttempt<T>> {
  try {
    return { value: await call(), error: null };
  } catch (error) {
    return { value: null, error: toNodeError(node, error) };
  }
}

/** Appends the explicit "data unavailable" note ARCHITECTURE.md §3 requires when an MCP call degraded. */
export function withDegradedNote(content: string, source: string, degraded: boolean): string {
  return degraded ? `${content}\n\n[Note: ${source} unavailable — continuing without it.]` : content;
}
