"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import type { AssembledResult } from "../../lib/graph/state";
import type { RunStatus } from "./RunView";
import { ResultView } from "./ResultView";

export interface WorkspacePanelProps {
  status: RunStatus;
  result: AssembledResult | null;
  /** The completed run's ID (TDD 0007/0012), used for the shareable permalink. */
  runId?: string | null;
  /**
   * The Graph tab's content (TDD 0015) — `LiveGraphPanel` for a run in
   * progress, `ReplayGraphPanel` for a stored one. `WorkspacePanel` doesn't
   * know which; it just hosts whatever it's given, or a "no trace" note when
   * there isn't one.
   */
  graph?: ReactNode;
}

type WorkspaceTab = "result" | "graph";

/**
 * The workspace panel (TDD 0014, extended by 0015): a tab strip over the
 * deliverables and the graph traversal, both views of the same run. The
 * standalone `/trace/[runId]` page is retired into this panel's Graph tab —
 * a live run's trace is now just the other tab, not a separate page a
 * visitor has to know to go find.
 */
export function WorkspacePanel({ status, result, runId, graph }: WorkspacePanelProps) {
  // A run in progress has nothing to show on Result yet, so Graph opens by
  // default while it's live; a finished run (this panel's usual state on
  // /run/[runId], since the live page now navigates away on completion)
  // opens on Result.
  const [tab, setTab] = useState<WorkspaceTab>(() => (status === "done" ? "result" : "graph"));

  return (
    <div className="workspace" data-testid="workspace-panel">
      {status === "done" && runId ? (
        <div className="run-links">
          {/* TDD 0012: worded as a share link on purpose — the URL is the
              only thing gating access, so a visitor copying it should know
              that's what they're copying. Now shares the graph too. */}
          <a className="trace-link" data-testid="run-permalink" href={`/run/${runId}`}>
            Save or share this run →
          </a>
        </div>
      ) : null}

      <div className="tablist workspace-tabs" role="tablist" data-testid="workspace-tabs">
        <button
          className="tab"
          role="tab"
          type="button"
          aria-selected={tab === "graph"}
          data-testid="tab-graph"
          onClick={() => setTab("graph")}
        >
          LangGraph
        </button>
        <button
          className="tab"
          role="tab"
          type="button"
          aria-selected={tab === "result"}
          data-testid="tab-result"
          onClick={() => setTab("result")}
        >
          Result
        </button>
      </div>

      <div className="workspace-body">
        {tab === "result" ? (
          status === "done" && result ? (
            <ResultView result={result} />
          ) : (
            <p className="workspace-empty" data-testid="workspace-empty">
              {status === "running" || status === "awaiting-clarification" || status === "awaiting-prd-approval"
                ? "The plan will appear here once the run finishes."
                : status === "error"
                  ? "The run didn't produce a result."
                  : "Nothing here yet."}
            </p>
          )
        ) : (
          (graph ?? (
            <p className="workspace-empty" data-testid="graph-unavailable">
              No trace was recorded for this run.
            </p>
          ))
        )}
      </div>
    </div>
  );
}
