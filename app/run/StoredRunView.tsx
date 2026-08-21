import type { RunEvalRecord } from "../../lib/eval/record";
import type { RunResult } from "../../lib/results/record";
import type { RunTrace } from "../../lib/tracing/record";
import { ReplayGraphPanel } from "../generate/ReplayGraphPanel";
import { WorkspacePanel } from "../generate/WorkspacePanel";
import { ThemeToggle } from "../theme/ThemeToggle";
import { QualitySection } from "./QualitySection";

export interface StoredRunViewProps {
  runId: string;
  /** `null` if this run's deliverables were never saved — it failed, is still running, or predates TDD 0012. */
  run: RunResult | null;
  /** `null` if this run was never traced — TDD 0007 records traces best-effort. */
  trace: RunTrace | null;
  /** TDD 0011: present only for runs the eval harness graded. */
  evaluation: RunEvalRecord | null;
}

/**
 * A finished run's permalink (TDD 0012, absorbing the trace page in TDD
 * 0015; redesigned to a full-width single column rather than the live
 * page's narrow-thread-plus-panel split — there's no live thread here, just
 * the request and the outcome). `run` and `trace` are independent rows
 * (0012 deliberately has no FK between them) so either can be absent —
 * a run that failed after producing a trace but before a result, or one
 * whose trace write failed, both render without error. Nothing here is
 * height-capped; the page just scrolls.
 *
 * The deliverables go through the *same* `ResultView` the live run used, so
 * a degraded section (TDD 0002's contract) carries the same warning here
 * that the visitor saw: a shared plan shouldn't look more complete than the
 * run that produced it.
 */
export function StoredRunView({ runId, run, trace, evaluation }: StoredRunViewProps) {
  const erroredNodes = new Set((run?.result.errors ?? []).map((error) => error.node));

  return (
    <section className="stored-run" data-testid="stored-run-view">
      <div className="brand-row">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true" />
          <span className="brand-name">AI Product Engineer Copilot</span>
        </div>
        <ThemeToggle />
      </div>

      {run ? (
        <div className="card stored-run-request-card" data-testid="thread">
          <div className="chat-turn chat-turn-user" data-testid="chat-turn-request">
            <p>{run.request}</p>
          </div>
          <p className="stored-run-meta" data-testid="stored-run-created-at">
            Generated {run.createdAt}
          </p>
        </div>
      ) : (
        <p className="thread-idle" data-testid="stored-run-no-result">
          This run&apos;s deliverables weren&apos;t saved — it failed, is still in progress, or predates
          permalinks. Its trace is still shown below.
        </p>
      )}

      <WorkspacePanel
        status="done"
        result={run?.result ?? null}
        runId={runId}
        graph={trace ? <ReplayGraphPanel traceNodes={trace.nodes} erroredNodes={erroredNodes} /> : undefined}
      />

      {trace ? (
        <dl className="trace-summary" data-testid="run-stats">
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
      ) : null}

      <QualitySection evaluation={evaluation} />
    </section>
  );
}
