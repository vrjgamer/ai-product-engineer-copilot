"use client";

import { Background, Controls, Handle, MiniMap, Position, ReactFlow } from "@xyflow/react";
import type { Edge, Node, NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

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
 * Hand-computed positions for the graph's nine fixed nodes (see
 * `docs/tdd/0015-graph-traversal-view.md`'s "why hand-rolled SVG" section —
 * the topology is closed and known at build time, so there's nothing for a
 * layout engine to compute). Revisit only if a node ever gets a real
 * runtime tool-calling loop, which would make positions genuinely dynamic.
 */
const POSITIONS: Record<GraphNodeName, { x: number; y: number }> = {
  supervisor: { x: 260, y: 0 },
  clarificationGate: { x: 20, y: 110 },
  prdAgent: { x: 260, y: 110 },
  prdApprovalGate: { x: 260, y: 220 },
  userStoryAgent: { x: 0, y: 350 },
  architectureReviewAgent: { x: 260, y: 350 },
  experimentDesignAgent: { x: 520, y: 350 },
  roadmapAgent: { x: 260, y: 480 },
  assembler: { x: 260, y: 570 },
};

interface AgentNodeData extends Record<string, unknown> {
  name: GraphNodeName;
  label: string;
  state: string;
  tools: { tool: string; state: string }[];
  selected: boolean;
  aborted: boolean;
}

function AgentNode({ data }: NodeProps<Node<AgentNodeData>>) {
  return (
    <div
      className="rf-node"
      data-testid={`graph-node-${data.name}`}
      data-state={data.state}
      data-selected={data.selected}
      data-aborted={data.aborted}
    >
      <Handle type="target" position={Position.Top} />
      <div className="rf-node-title">{data.label}</div>
      <div className="rf-node-state">{data.state}</div>
      {data.tools.length > 0 ? (
        <div className="rf-node-tools">
          {data.tools.map((leaf) => (
            <span
              key={leaf.tool}
              className="rf-node-tool"
              data-testid={`graph-tool-${data.name}-${leaf.tool}`}
              data-state={leaf.state}
            >
              <span className="rf-node-tool-dot" aria-hidden="true" />
              <span className="rf-node-tool-label">{leaf.tool}</span>
            </span>
          ))}
        </div>
      ) : null}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { agent: AgentNode };

/**
 * The animated graph traversal (TDD 0015), rendered with React Flow: the
 * real topology, drawn from a `GraphViewState` derived elsewhere
 * (`graphViewModel.ts`) from either live events or a stored trace — this
 * component only renders, it doesn't decide state. The offscreen ordered
 * list below the canvas is the actual text-equivalent for screen readers,
 * including a button per node so keyboard/AT users reach the same per-node
 * detail a canvas click gives.
 */
export function GraphView({ viewState, selectedNode, onSelectNode, aborted = false }: GraphViewProps) {
  const byName = new Map(viewState.nodes.map((node) => [node.name, node]));

  const nodes: Node<AgentNodeData>[] = NODE_ORDER.map((name) => {
    const nodeView = byName.get(name);
    const state = nodeView?.state ?? "pending";
    return {
      id: name,
      type: "agent",
      position: POSITIONS[name],
      draggable: false,
      connectable: false,
      data: {
        name,
        label: NODE_LABEL[name],
        state,
        tools: nodeView?.tools ?? [],
        selected: selectedNode === name,
        aborted: aborted && state === "pending",
      },
    };
  });

  const edges: Edge[] = GRAPH_EDGES.map((edge) => {
    const running = byName.get(edge.to)?.state === "running";
    return {
      id: `${edge.from}-${edge.to}`,
      source: edge.from,
      target: edge.to,
      animated: running,
      label: edge.label,
      className: [edge.conditional ? "rf-edge-conditional" : "", running ? "rf-edge-running" : ""]
        .filter(Boolean)
        .join(" "),
    };
  });

  return (
    <div className="graph-canvas" data-testid="graph-view">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_event, node) => onSelectNode(node.id as GraphNodeName)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1.3} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeStrokeWidth={0} />
      </ReactFlow>
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
