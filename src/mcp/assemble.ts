import type { McpCallResult } from "mcp-toolkit";
import type { MetricRecord } from "./analytics-server.js";

interface ToolContentResult {
  content: Array<{ type: string; text?: string }>;
}

function textPassages(result: McpCallResult): string[] {
  if (!result.ok) return [];
  const value = result.value as ToolContentResult;
  return value.content
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string);
}

/** Retrieved docs-store passages, ready to fold into generated output. */
export function assembleDocsContext(result: McpCallResult): string[] {
  return textPassages(result);
}

/**
 * Looks up a single metric from an analytics MCP result. Returns null — never
 * a fabricated number — when the metric wasn't actually returned by the server.
 */
export function citeMetric(
  result: McpCallResult,
  metricName: string
): MetricRecord | null {
  const [passage] = textPassages(result);
  if (!passage) return null;

  const metrics = JSON.parse(passage) as MetricRecord[];
  return metrics.find((metric) => metric.name === metricName) ?? null;
}
