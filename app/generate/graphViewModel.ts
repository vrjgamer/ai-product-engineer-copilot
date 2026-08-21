import type { GraphNodeName, ProgressEvent } from "../../lib/graph/progress";
import type { NodeTrace } from "../../lib/tracing/record";
import { NODE_ORDER } from "./nodeMeta";

export type NodeState = "pending" | "running" | "completed" | "error" | "skipped";
export type ToolCallState = "started" | "completed" | "error";

export interface ToolCallLeaf {
  tool: string;
  state: ToolCallState;
}

export interface GraphNodeView {
  name: GraphNodeName;
  state: NodeState;
  tools: ToolCallLeaf[];
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface GraphViewState {
  nodes: GraphNodeView[];
}

/** The MCP tools each node can call, at most once each (TDD 0015's static-topology argument) — the closed set of leaf slots a node reserves. */
export const NODE_TOOLS: Record<GraphNodeName, string[]> = {
  supervisor: [],
  clarificationGate: [],
  prdAgent: ["search_docs"],
  prdApprovalGate: [],
  userStoryAgent: ["search_docs"],
  architectureReviewAgent: ["search_docs", "get_repo_stats"],
  experimentDesignAgent: [],
  roadmapAgent: ["get_repo_stats"],
  assembler: [],
};

/**
 * The graph's fixed edges (`lib/graph/index.ts`). Two conditional points:
 * the supervisor's routing decision (`clarificationGate` vs `prdAgent`), and
 * `prdApprovalGate`'s (revise, looping back to `prdAgent`, vs approve,
 * continuing to the fan-out) — the graph's one cycle.
 */
export const GRAPH_EDGES: { from: GraphNodeName; to: GraphNodeName; conditional?: boolean; label: string }[] = [
  { from: "supervisor", to: "clarificationGate", conditional: true, label: "unclear" },
  { from: "supervisor", to: "prdAgent", conditional: true, label: "clear enough" },
  { from: "clarificationGate", to: "prdAgent", label: "answered" },
  { from: "prdAgent", to: "prdApprovalGate", label: "PRD draft" },
  { from: "prdApprovalGate", to: "prdAgent", conditional: true, label: "revise" },
  { from: "prdApprovalGate", to: "userStoryAgent", conditional: true, label: "approved" },
  { from: "prdApprovalGate", to: "architectureReviewAgent", conditional: true, label: "approved" },
  { from: "prdApprovalGate", to: "experimentDesignAgent", conditional: true, label: "approved" },
  { from: "userStoryAgent", to: "roadmapAgent", label: "user stories" },
  { from: "architectureReviewAgent", to: "roadmapAgent", label: "arch review" },
  { from: "experimentDesignAgent", to: "roadmapAgent", label: "experiment design" },
  { from: "roadmapAgent", to: "assembler", label: "roadmap" },
];

function emptyNodes(): GraphNodeView[] {
  return NODE_ORDER.map((name) => ({ name, state: "pending" as NodeState, tools: [] }));
}

/**
 * Derives the graph's live view-model from the same `ProgressEvent`s TDD
 * 0005's stream carries — the whole point being that live and replay share
 * one renderer fed by one shape (`GraphViewState`), not two.
 */
export function viewStateFromEvents(events: ProgressEvent[]): GraphViewState {
  const nodes = emptyNodes();
  const byName = new Map(nodes.map((node) => [node.name, node]));

  for (const event of events) {
    if (event.type === "node-status") {
      const node = byName.get(event.node);
      if (!node) continue;
      node.state = event.status === "running" ? "running" : event.status === "completed" ? "completed" : "error";
    } else if (event.type === "mcp-call") {
      const node = byName.get(event.node);
      if (!node) continue;
      const existing = node.tools.find((leaf) => leaf.tool === event.tool);
      if (existing) existing.state = event.status;
      else node.tools.push({ tool: event.tool, state: event.status });
    }
  }

  // The conditional edge (TDD 0010): once the supervisor has finished
  // without clarificationGate ever reporting, the graph took the direct
  // prdAgent edge, so the gate reads as skipped rather than perpetually
  // "pending" — the same reasoning ProgressLog applied before 0014 deleted it.
  const supervisor = byName.get("supervisor");
  const gate = byName.get("clarificationGate");
  if (supervisor?.state === "completed" && gate?.state === "pending") {
    gate.state = "skipped";
  }

  return { nodes };
}

/**
 * Derives the graph's replay view-model from a stored run's `run_traces`
 * row plus the errored-node set from its `run_results` row (TDD 0007/0012) —
 * `NodeTrace` alone can't distinguish a degraded node from a clean one (see
 * `finalizeNodeTrace`, which records a trace regardless of outcome).
 *
 * A node with no trace at all is left "pending": either the conditional gate
 * never fired, or the run ended in `fatal-error` before reaching it. Both
 * read the same way here deliberately — this is replay of a finished run,
 * not a live one, so "pending" means "never reached," not "still running."
 */
export function viewStateFromTrace(traceNodes: NodeTrace[], erroredNodes: Set<string> = new Set()): GraphViewState {
  const nodes = emptyNodes();
  const byName = new Map(nodes.map((node) => [node.name, node]));
  const reached = new Set<string>();

  for (const trace of traceNodes) {
    const node = byName.get(trace.node as GraphNodeName);
    if (!node) continue;
    reached.add(trace.node);
    node.state = erroredNodes.has(trace.node) ? "error" : "completed";
    node.latencyMs = trace.latencyMs;
    node.inputTokens = trace.inputTokens;
    node.outputTokens = trace.outputTokens;
    node.tools = trace.mcpCalls.map((tool) => ({ tool, state: "completed" as ToolCallState }));
  }

  const supervisor = byName.get("supervisor");
  const gate = byName.get("clarificationGate");
  if (supervisor && reached.has("supervisor") && !reached.has("clarificationGate") && gate) {
    gate.state = "skipped";
  }

  return { nodes };
}
