import type { AssembledResult } from "../../lib/graph/state";
import type { RunStatus } from "./RunView";
import { ResultView } from "./ResultView";

export interface WorkspacePanelProps {
  status: RunStatus;
  result: AssembledResult | null;
  /** The completed run's ID (TDD 0007), used to link to `/trace/[runId]` and `/run/[runId]`. */
  runId?: string | null;
}

/**
 * The workspace panel (TDD 0014): a tab strip — one tab today, extended with
 * a Graph tab in 0015 — holding `ResultView` unmodified once a result
 * arrives, and an empty/working state before then.
 */
export function WorkspacePanel({ status, result, runId }: WorkspacePanelProps) {
  return (
    <div className="workspace" data-testid="workspace-panel">
      <div className="tablist workspace-tabs" role="tablist" data-testid="workspace-tabs">
        <button className="tab" role="tab" type="button" aria-selected="true" data-testid="tab-result-view">
          Result
        </button>
      </div>
      <div className="workspace-body">
        {status === "done" && result ? (
          <>
            {runId ? (
              <div className="run-links">
                {/* TDD 0012: worded as a share link on purpose — the URL is the
                    only thing gating access, so a visitor copying it should
                    know that's what they're copying. */}
                <a className="trace-link" data-testid="run-permalink" href={`/run/${runId}`}>
                  Save or share this plan →
                </a>
                <a className="trace-link" data-testid="view-trace-link" href={`/trace/${runId}`}>
                  View trace →
                </a>
              </div>
            ) : null}
            <ResultView result={result} />
          </>
        ) : (
          <p className="workspace-empty" data-testid="workspace-empty">
            {status === "running" || status === "awaiting-clarification"
              ? "The plan will appear here once the run finishes."
              : status === "error"
                ? "The run didn't produce a result."
                : "Nothing here yet."}
          </p>
        )}
      </div>
    </div>
  );
}
