import type { GraphState, GraphStateUpdate } from "../state";

/**
 * Entry point of the graph. Doesn't call a model — its role is the routing
 * decision documented in ARCHITECTURE.md §1 (PRD first, alone), which for
 * this fixed graph shape is just "go to prdAgent next" via the static edge
 * in `buildGraph()`. Kept as its own node so later work (e.g. richer
 * routing) has a place to land without changing the graph shape.
 */
export async function supervisor(_state: GraphState): Promise<GraphStateUpdate> {
  return {};
}
