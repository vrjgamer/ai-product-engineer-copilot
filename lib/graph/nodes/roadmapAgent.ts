import type { GraphState, GraphStateUpdate } from "../state";
import { generateNodeText, toNodeError } from "./shared";

const SYSTEM_PROMPT =
  "You are a product lead. Produce a sequenced roadmap using the PRD's scope, " +
  "the user stories' work breakdown, the architecture review's feasibility/risk " +
  "notes, and the experiment design's validation plan.";

export async function roadmapAgent(state: GraphState): Promise<GraphStateUpdate> {
  try {
    const content = await generateNodeText(
      SYSTEM_PROMPT,
      [
        `PRD:\n${state.prd?.content ?? ""}`,
        `User stories:\n${state.userStories?.content ?? "(unavailable)"}`,
        `Architecture review:\n${state.architectureReview?.content ?? "(unavailable)"}`,
        `Experiment design:\n${state.experimentDesign?.content ?? "(unavailable)"}`,
      ].join("\n\n"),
    );
    return { roadmap: { content } };
  } catch (error) {
    return { errors: [toNodeError("roadmapAgent", error)] };
  }
}
