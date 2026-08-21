"use client";

import type { GraphNodeName } from "../../lib/graph/progress";
import type { GraphViewState } from "./graphViewModel";
import { GRAPH_EDGES } from "./graphViewModel";
import { NODE_LABEL, NODE_ORDER } from "./nodeMeta";

export interface GraphViewProps {
  viewState: GraphViewState;
  selectedNode: GraphNodeName | null;
  onSelectNode: (name: GraphNodeName) => void;
  /**
   * TDD 0015: a run that ended in `fatal-error` partway through leaves some
   * nodes never reached. Undistinguished from a live run's ordinary
   * "pending" they'd read as still in progress, so this flags them as
   * aborted instead — one of the two states the TDD calls out as easy to
   * forget (the other being the skipped clarification gate, which
   * `graphViewModel.ts` already derives).
   */
  aborted?: boolean;
}

/**
 * Hand-computed positions for the graph's eight fixed nodes (see
 * `docs/tdd/0015-graph-traversal-view.md`'s "why hand-rolled SVG" section —
 * the topology is closed and known at build time, so there's nothing for a
 * layout engine to compute). Revisit only if a node ever gets a real
 * runtime tool-calling loop, which would make positions genuinely dynamic.
 */
const POSITIONS: Record<GraphNodeName, { x: number; y: number }> = {
  supervisor: { x: 310, y: 34 },
  clarificationGate: { x: 130, y: 118 },
  prdAgent: { x: 310, y: 118 },
  userStoryAgent: { x: 110, y: 222 },
  architectureReviewAgent: { x: 310, y: 222 },
  experimentDesignAgent: { x: 510, y: 222 },
  roadmapAgent: { x: 310, y: 316 },
  assembler: { x: 310, y: 380 },
};

const NODE_RADIUS = 26;

/**
 * The animated graph traversal (TDD 0015): the real topology, drawn from a
 * `GraphViewState` derived elsewhere (`graphViewModel.ts`) from either live
 * events or a stored trace — this component only renders, it doesn't decide
 * state. The SVG itself is `aria-hidden`; the offscreen ordered list below
 * it is the actual text-equivalent, including a button per node so
 * keyboard/AT users can reach the same per-node detail a mouse click gives.
 */
export function GraphView({ viewState, selectedNode, onSelectNode, aborted = false }: GraphViewProps) {
  const byName = new Map(viewState.nodes.map((node) => [node.name, node]));

  return (
    <div className="graph" data-testid="graph-view">
      <svg className="graph-svg" viewBox="0 0 620 410" aria-hidden="true">
        <g className="graph-edges">
          {GRAPH_EDGES.map((edge) => {
            const from = POSITIONS[edge.from];
            const to = POSITIONS[edge.to];
            return (
              <line
                key={`${edge.from}-${edge.to}`}
                className="graph-edge"
                data-conditional={edge.conditional ?? false}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
              />
            );
          })}
        </g>
        <g className="graph-nodes">
          {NODE_ORDER.map((name) => {
            const node = byName.get(name);
            const pos = POSITIONS[name];
            const state = node?.state ?? "pending";
            const nodeAborted = aborted && state === "pending";
            const tools = node?.tools ?? [];
            return (
              <g key={name} transform={`translate(${pos.x}, ${pos.y})`}>
                <circle
                  className="graph-node"
                  data-testid={`graph-node-${name}`}
                  data-state={state}
                  data-selected={selectedNode === name}
                  data-aborted={nodeAborted}
                  r={NODE_RADIUS}
                  onClick={() => onSelectNode(name)}
                />
                <text className="graph-node-label" textAnchor="middle" dy={NODE_RADIUS + 16}>
                  {NODE_LABEL[name]}
                </text>
                {tools.map((leaf, index) => (
                  <circle
                    key={leaf.tool}
                    className="graph-tool"
                    data-testid={`graph-tool-${name}-${leaf.tool}`}
                    data-state={leaf.state}
                    r={7}
                    cx={(index - (tools.length - 1) / 2) * 34}
                    cy={NODE_RADIUS + 34}
                  />
                ))}
              </g>
            );
          })}
        </g>
      </svg>
      <ul className="sr-only" data-testid="graph-text-equivalent">
        {NODE_ORDER.map((name) => {
          const node = byName.get(name);
          const state = node?.state ?? "pending";
          const tools = node?.tools ?? [];
          return (
            <li key={name}>
              <button type="button" onClick={() => onSelectNode(name)} aria-pressed={selectedNode === name}>
                {NODE_LABEL[name]}: {state}
                {tools.length > 0 ? ` — ${tools.map((leaf) => `${leaf.tool} ${leaf.state}`).join(", ")}` : ""}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
