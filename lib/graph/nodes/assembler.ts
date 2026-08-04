import type { GraphState, GraphStateUpdate } from "../state";

/**
 * Merges the five sub-agent outputs (and any accumulated errors) into one
 * result. No model call — this node is a pure aggregation step, the graph
 * equivalent of the old project's post-hoc `assemble.ts` helpers.
 */
export async function assembler(state: GraphState): Promise<GraphStateUpdate> {
  return {
    result: {
      prd: state.prd,
      userStories: state.userStories,
      architectureReview: state.architectureReview,
      experimentDesign: state.experimentDesign,
      roadmap: state.roadmap,
      errors: state.errors,
    },
  };
}
