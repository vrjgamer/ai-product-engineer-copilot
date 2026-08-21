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
 * Builds a compressed replay timeline from a stored run's per-node
 * latencies: each node starts as soon as every traced predecessor it
 * actually had (per `GRAPH_EDGES`, restricted to nodes this run reached —
 * the conditional gate means "predecessor" isn't fixed) has finished, held
 * proportionally to its real latency, then linearly scaled so the critical
 * path lands in `TARGET_TOTAL_MS`. Pure function — no timers — so the
 * animation driver (a `setTimeout`/`requestAnimationFrame` loop) can be
 * tested separately from the schedule it walks.
 */
export function buildReplaySchedule(traceNodes: NodeTrace[]): ReplaySchedule {
  const traced = new Set(traceNodes.map((trace) => trace.node));
  const latencyByNode = new Map(traceNodes.map((trace) => [trace.node, trace.latencyMs]));
  const order = NODE_ORDER.filter((name) => traced.has(name));

  const predecessors = new Map<string, string[]>();
  for (const name of order) predecessors.set(name, []);
  for (const edge of GRAPH_EDGES) {
    if (traced.has(edge.from) && traced.has(edge.to)) {
      predecessors.get(edge.to)?.push(edge.from);
    }
  }

  const startReal = new Map<string, number>();
  const endReal = new Map<string, number>();
  for (const name of order) {
    const preds = predecessors.get(name) ?? [];
    const start = preds.length === 0 ? 0 : Math.max(...preds.map((pred) => endReal.get(pred) ?? 0));
    const latency = latencyByNode.get(name) ?? 0;
    startReal.set(name, start);
    endReal.set(name, start + latency);
  }

  const totalReal = Math.max(...Array.from(endReal.values(), (value) => value), 1);
  const scale = TARGET_TOTAL_MS / totalReal;

  const steps: ReplayStep[] = order.map((name) => ({
    node: name,
    startMs: Math.round((startReal.get(name) ?? 0) * scale),
    endMs: Math.round((endReal.get(name) ?? 0) * scale),
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
