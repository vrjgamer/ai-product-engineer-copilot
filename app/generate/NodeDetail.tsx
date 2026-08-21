import type { GraphNodeView } from "./graphViewModel";
import { NODE_LABEL } from "./nodeMeta";

export interface NodeDetailProps {
  node: GraphNodeView | null;
}

/**
 * Per-node detail on selection (TDD 0015) — latency, token counts, and MCP
 * calls, the same data `TraceView`'s table used to show, now reachable by
 * selecting a node in the graph instead of scanning a row. Live selection
 * and replay selection share this component: a live run simply doesn't have
 * latency/tokens yet, which renders as "—" rather than a blank.
 */
export function NodeDetail({ node }: NodeDetailProps) {
  if (!node) {
    return (
      <p className="node-detail-empty" data-testid="node-detail-empty">
        Select a node in the graph to see its detail.
      </p>
    );
  }

  return (
    <dl className="node-detail trace-summary" data-testid="node-detail">
      <div className="trace-stat">
        <dt>Node</dt>
        <dd>{NODE_LABEL[node.name]}</dd>
      </div>
      <div className="trace-stat">
        <dt>State</dt>
        <dd data-testid="node-detail-state">{node.state}</dd>
      </div>
      <div className="trace-stat">
        <dt>Latency (ms)</dt>
        <dd data-testid="node-detail-latency">{node.latencyMs ?? "—"}</dd>
      </div>
      <div className="trace-stat">
        <dt>Input tokens</dt>
        <dd data-testid="node-detail-input-tokens">{node.inputTokens ?? "—"}</dd>
      </div>
      <div className="trace-stat">
        <dt>Output tokens</dt>
        <dd data-testid="node-detail-output-tokens">{node.outputTokens ?? "—"}</dd>
      </div>
      <div className="trace-stat">
        <dt>MCP calls</dt>
        <dd data-testid="node-detail-mcp-calls">
          {node.tools.length > 0 ? node.tools.map((leaf) => `${leaf.tool} (${leaf.state})`).join(", ") : "none"}
        </dd>
      </div>
    </dl>
  );
}
