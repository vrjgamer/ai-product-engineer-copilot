"use client";

import { useMemo, useState } from "react";

import type { GraphNodeName } from "../../lib/graph/progress";
import type { NodeTrace } from "../../lib/tracing/record";
import { GraphView } from "./GraphView";
import { NodeDetail } from "./NodeDetail";
import { viewStateFromTrace } from "./graphViewModel";

export interface ReplayGraphPanelProps {
  traceNodes: NodeTrace[];
  /** Node names present in the run's `AssembledResult.errors` (TDD 0002/0007) — a `NodeTrace` alone can't tell a degraded node from a clean one. */
  erroredNodes?: Set<string>;
}

/**
 * The Graph tab's content for a stored run (TDD 0015): the real traversal in
 * its finished state, straight away — no replay animation. An earlier
 * version compressed the traversal into a several-second animation, but its
 * timing was fragile enough (a single slow node could round every other
 * node's scaled duration to 0ms) that it read as broken more often than not,
 * so it's gone rather than re-fixed again.
 */
export function ReplayGraphPanel({ traceNodes, erroredNodes = new Set() }: ReplayGraphPanelProps) {
  const [selectedNode, setSelectedNode] = useState<GraphNodeName | null>(null);
  const finalView = useMemo(() => viewStateFromTrace(traceNodes, erroredNodes), [traceNodes, erroredNodes]);
  const selected = selectedNode ? (finalView.nodes.find((node) => node.name === selectedNode) ?? null) : null;

  return (
    <div className="graph-panel" data-testid="replay-graph-panel">
      <GraphView viewState={finalView} selectedNode={selectedNode} onSelectNode={setSelectedNode} />
      <NodeDetail node={selected} />
    </div>
  );
}
