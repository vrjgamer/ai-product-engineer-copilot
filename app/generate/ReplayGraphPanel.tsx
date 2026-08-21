"use client";

import { useMemo, useState } from "react";

import type { GraphNodeName } from "../../lib/graph/progress";
import type { NodeTrace } from "../../lib/tracing/record";
import { GraphView } from "./GraphView";
import { NodeDetail } from "./NodeDetail";
import { viewStateFromTrace } from "./graphViewModel";
import { buildReplaySchedule, viewStateAtElapsed } from "./replaySchedule";
import { useReplayPlayer } from "./useReplayPlayer";

export interface ReplayGraphPanelProps {
  traceNodes: NodeTrace[];
  /** Node names present in the run's `AssembledResult.errors` (TDD 0002/0007) — a `NodeTrace` alone can't tell a degraded node from a clean one. */
  erroredNodes?: Set<string>;
}

/**
 * The Graph tab's replay content for a stored run (TDD 0015): the real
 * traversal, compressed into a several-second animation via
 * `useReplayPlayer`, with a restart control. Node detail always reflects the
 * run's *final* outcome (`finalView`), not the animated frame — selecting a
 * node mid-replay to check its latency shouldn't require waiting for the
 * animation to reach it.
 */
export function ReplayGraphPanel({ traceNodes, erroredNodes = new Set() }: ReplayGraphPanelProps) {
  const [selectedNode, setSelectedNode] = useState<GraphNodeName | null>(null);
  const schedule = useMemo(() => buildReplaySchedule(traceNodes), [traceNodes]);
  const finalView = useMemo(() => viewStateFromTrace(traceNodes, erroredNodes), [traceNodes, erroredNodes]);
  const player = useReplayPlayer(schedule);
  const animatedView = viewStateAtElapsed(schedule, finalView, player.elapsedMs);
  const selected = selectedNode ? (finalView.nodes.find((node) => node.name === selectedNode) ?? null) : null;

  return (
    <div className="graph-panel" data-testid="replay-graph-panel">
      <div className="replay-controls">
        <button type="button" className="chip" data-testid="replay-restart" onClick={player.restart}>
          {player.playing ? "Restart" : "Play again"}
        </button>
      </div>
      <GraphView viewState={animatedView} selectedNode={selectedNode} onSelectNode={setSelectedNode} />
      <NodeDetail node={selected} />
    </div>
  );
}
