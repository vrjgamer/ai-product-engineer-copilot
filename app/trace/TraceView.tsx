import type { RunEvalRecord } from "../../lib/eval/record";
import { RUBRIC_DIMENSIONS } from "../../lib/eval/rubric";
import type { RunTrace } from "../../lib/tracing/record";

export interface TraceViewProps {
  trace: RunTrace;
  /** TDD 0011: present only for runs the eval harness graded — visitor runs aren't judged. */
  evaluation?: RunEvalRecord | null;
}

/**
 * Renders one run's trace (TDD 0007): per-node latency, token usage, and
 * MCP tool calls, plus the run's total cost. Pure props in, no fetch of its
 * own — `app/trace/[runId]/page.tsx` owns fetching the trace by run ID.
 *
 * When the run also carries a quality judgment (TDD 0011), that renders
 * below the node table. Absence is the normal case and is stated rather than
 * left blank: "this run was never judged" is a fact about the system's
 * scope, not a rendering gap.
 */
export function TraceView({ trace, evaluation = null }: TraceViewProps) {
  return (
    <section className="trace" data-testid="trace-view">
      <h1 className="section-title">Run trace</h1>
      <dl className="trace-summary">
        <div className="trace-stat">
          <dt>Run ID</dt>
          <dd data-testid="trace-run-id">{trace.runId}</dd>
        </div>
        <div className="trace-stat">
          <dt>Started</dt>
          <dd data-testid="trace-started-at">{trace.startedAt}</dd>
        </div>
        <div className="trace-stat">
          <dt>Ended</dt>
          <dd data-testid="trace-ended-at">{trace.endedAt}</dd>
        </div>
        <div className="trace-stat">
          <dt>Total cost</dt>
          <dd data-testid="trace-total-cost">${trace.totalCostUsd.toFixed(4)}</dd>
        </div>
      </dl>
      <div className="table-scroll">
        <table className="trace-table" data-testid="trace-node-table">
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
      </div>
      <QualitySection evaluation={evaluation} />
    </section>
  );
}

function QualitySection({ evaluation }: { evaluation: RunEvalRecord | null }) {
  if (!evaluation) {
    return (
      <p className="trace-unjudged" data-testid="trace-unjudged">
        This run wasn&apos;t scored for quality. Only runs from the golden-set harness
        (<code>npm run eval</code>) are judged — see <code>ARCHITECTURE.md</code> §9.
      </p>
    );
  }

  const { deliverables, missing, tags, overall, judgeModelId } = evaluation.evaluation;

  return (
    <div className="trace-quality" data-testid="trace-quality">
      <h2 className="section-title">Quality judgment</h2>
      <dl className="trace-summary">
        <div className="trace-stat">
          <dt>Overall</dt>
          <dd data-testid="trace-quality-overall">{overall.toFixed(2)} / 5</dd>
        </div>
        <div className="trace-stat">
          <dt>Judge</dt>
          <dd data-testid="trace-quality-judge">{judgeModelId}</dd>
        </div>
        <div className="trace-stat">
          <dt>Golden case</dt>
          <dd data-testid="trace-quality-case">{evaluation.caseId ?? "—"}</dd>
        </div>
        <div className="trace-stat">
          <dt>Failure tags</dt>
          <dd data-testid="trace-quality-tags">{tags.length > 0 ? tags.join(", ") : "none"}</dd>
        </div>
      </dl>
      <div className="table-scroll">
        <table className="trace-table" data-testid="trace-quality-table">
          <thead>
            <tr>
              <th>Deliverable</th>
              <th>Score</th>
              {RUBRIC_DIMENSIONS.map((dimension) => (
                <th key={dimension}>{dimension}</th>
              ))}
              <th>Tags</th>
            </tr>
          </thead>
          <tbody>
            {deliverables.map((entry) => (
              <tr key={entry.deliverable} data-testid={`trace-quality-${entry.deliverable}`}>
                <td>{entry.deliverable}</td>
                <td data-testid={`trace-quality-score-${entry.deliverable}`}>
                  {entry.score.toFixed(2)}
                </td>
                {RUBRIC_DIMENSIONS.map((dimension) => (
                  <td key={dimension}>{entry.judgment.scores[dimension]}</td>
                ))}
                <td data-testid={`trace-quality-tags-${entry.deliverable}`}>
                  {entry.judgment.tags.length > 0 ? entry.judgment.tags.join(", ") : "—"}
                </td>
              </tr>
            ))}
            {missing.map((deliverable) => (
              <tr key={deliverable} data-testid={`trace-quality-missing-${deliverable}`}>
                <td>{deliverable}</td>
                {/* Not scored 1/5 — an unwritten document is an availability
                    failure, already visible in the node table above. */}
                <td colSpan={RUBRIC_DIMENSIONS.length + 2}>not produced by this run</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
