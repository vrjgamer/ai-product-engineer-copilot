import type { GraphNodeName } from "../../lib/graph/progress";
import type { NodeTrace } from "../../lib/tracing/record";
import type { GraphViewState } from "./graphViewModel";
import { GRAPH_EDGES } from "./graphViewModel";
import { NODE_ORDER } from "./nodeMeta";

export interface ReplayStep {
  node: GraphNodeName;
  startMs: number;
  endMs: number;
}

export interface ReplaySchedule {
  steps: ReplayStep[];
  totalMs: number;
}

/**
 * A real run takes 1-2 minutes; nobody watches that twice (TDD 0015), so
 * replay compresses the whole traversal into this fixed window regardless of
 * the run's actual duration.
 */
const TARGET_TOTAL_MS = 7_000;

/**
 * Builds a compressed replay timeline: each node starts as soon as every
 * traced predecessor it actually had (per `GRAPH_EDGES`, restricted to
 * nodes this run reached — the conditional gate means "predecessor" isn't
 * fixed) has finished, then holds for one equal-length "beat" before ending
 * — parallel siblings share a beat, so they still visibly start and finish
 * together. Deliberately *not* proportional to real per-node latency: a
 * single outlier (a slow model call, a retried MCP request — both common)
 * would dominate the linear scale and round every other node's duration
 * down to ~0ms, which looks exactly like "nothing animates, then the whole
 * graph appears already finished." Real latency stays exactly where it
 * already was useful — the per-node detail panel on selection — and has no
 * bearing on how long a node's replay beat lasts. Pure function — no
 * timers — so the animation driver (a `requestAnimationFrame` loop) can be
 * tested separately from the schedule it walks.
 */
export function buildReplaySchedule(traceNodes: NodeTrace[]): ReplaySchedule {
  const traced = new Set(traceNodes.map((trace) => trace.node));
  const order = NODE_ORDER.filter((name) => traced.has(name));

  const predecessors = new Map<string, string[]>();
  for (const name of order) predecessors.set(name, []);
  for (const edge of GRAPH_EDGES) {
    if (traced.has(edge.from) && traced.has(edge.to)) {
      predecessors.get(edge.to)?.push(edge.from);
    }
  }

  const BEAT = 1;
  const startUnits = new Map<string, number>();
  const endUnits = new Map<string, number>();
  for (const name of order) {
    const preds = predecessors.get(name) ?? [];
    const start = preds.length === 0 ? 0 : Math.max(...preds.map((pred) => endUnits.get(pred) ?? 0));
    startUnits.set(name, start);
    endUnits.set(name, start + BEAT);
  }

  const totalUnits = Math.max(...Array.from(endUnits.values(), (value) => value), 1);
  const scale = TARGET_TOTAL_MS / totalUnits;

  const steps: ReplayStep[] = order.map((name) => ({
    node: name,
    startMs: Math.round((startUnits.get(name) ?? 0) * scale),
    endMs: Math.round((endUnits.get(name) ?? 0) * scale),
  }));

  const totalMs = steps.reduce((max, step) => Math.max(max, step.endMs), 0);

  return { steps, totalMs };
}

/**
 * The pure "what does the graph look like at time T" projection a replay
 * player walks over — the whole testable surface of replay, per the TDD's
 * notes (don't try to assert on the timer itself). A node the schedule never
 * gave a slot to (not reached this run) or hasn't started yet reads
 * "pending"; between its start and end it reads "running" so the traversal
 * visibly builds; at or after its end it's `finalView`'s real outcome
 * (completed/error). A skipped clarification gate has no slot and nothing to
 * animate, so it renders as itself throughout.
 */
export function viewStateAtElapsed(
  schedule: ReplaySchedule,
  finalView: GraphViewState,
  elapsedMs: number,
): GraphViewState {
  const stepByNode = new Map(schedule.steps.map((step) => [step.node, step]));

  const nodes = finalView.nodes.map((node) => {
    if (node.state === "skipped") return node;

    const step = stepByNode.get(node.name);
    if (!step || elapsedMs < step.startMs) {
      return { ...node, state: "pending" as const, tools: [] };
    }
    if (elapsedMs < step.endMs) {
      return { ...node, state: "running" as const };
    }
    return node;
  });

  return { nodes };
}
