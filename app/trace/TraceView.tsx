import type { RunTrace } from "../../lib/tracing/record";

export interface TraceViewProps {
  trace: RunTrace;
}

/**
 * Renders one run's trace (TDD 0007): per-node latency, token usage, and
 * MCP tool calls, plus the run's total cost. Pure props in, no fetch of its
 * own — `app/trace/[runId]/page.tsx` owns fetching the trace by run ID.
 */
export function TraceView({ trace }: TraceViewProps) {
  return (
    <section data-testid="trace-view">
      <dl>
        <dt>Run ID</dt>
        <dd data-testid="trace-run-id">{trace.runId}</dd>
        <dt>Started</dt>
        <dd data-testid="trace-started-at">{trace.startedAt}</dd>
        <dt>Ended</dt>
        <dd data-testid="trace-ended-at">{trace.endedAt}</dd>
        <dt>Total cost</dt>
        <dd data-testid="trace-total-cost">${trace.totalCostUsd.toFixed(4)}</dd>
      </dl>
      <table data-testid="trace-node-table">
        <thead>
          <tr>
            <th>Node</th>
            <th>Latency (ms)</th>
            <th>Input tokens</th>
            <th>Output tokens</th>
            <th>MCP calls</th>
          </tr>
        </thead>
        <tbody>
          {trace.nodes.map((node, index) => (
            <tr key={`${node.node}-${index}`} data-testid={`trace-node-${node.node}`}>
              <td>{node.node}</td>
              <td data-testid={`trace-latency-${node.node}`}>{node.latencyMs}</td>
              <td data-testid={`trace-input-tokens-${node.node}`}>{node.inputTokens ?? "—"}</td>
              <td data-testid={`trace-output-tokens-${node.node}`}>{node.outputTokens ?? "—"}</td>
              <td data-testid={`trace-mcp-calls-${node.node}`}>
                {node.mcpCalls.length > 0 ? node.mcpCalls.join(", ") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
