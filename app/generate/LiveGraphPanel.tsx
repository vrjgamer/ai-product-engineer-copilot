"use client";

import { useState } from "react";

import type { GraphNodeName, ProgressEvent } from "../../lib/graph/progress";
import { GraphView } from "./GraphView";
import { NodeDetail } from "./NodeDetail";
import { viewStateFromEvents } from "./graphViewModel";

export interface LiveGraphPanelProps {
  events: ProgressEvent[];
  /** True once the run has ended in `fatal-error` — nodes it never reached read as aborted rather than pending-as-in-still-to-come. */
  aborted?: boolean;
}

/**
 * The Graph tab's live content (TDD 0015): recomputes the view-model from
 * the same accumulated `events` the thread already renders from, so the
 * traversal builds itself as the run proceeds. Node selection is owned here
 * (not in `GraphView`, which is a pure renderer) so it can feed `NodeDetail`.
 */
export function LiveGraphPanel({ events, aborted = false }: LiveGraphPanelProps) {
  const [selectedNode, setSelectedNode] = useState<GraphNodeName | null>(null);
  const viewState = viewStateFromEvents(events);
  const selected = selectedNode ? (viewState.nodes.find((node) => node.name === selectedNode) ?? null) : null;

  return (
    <div className="graph-panel" data-testid="live-graph-panel">
      <GraphView viewState={viewState} selectedNode={selectedNode} onSelectNode={setSelectedNode} aborted={aborted} />
      <NodeDetail node={selected} />
    </div>
  );
}
