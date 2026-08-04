import type { GraphState, GraphStateUpdate } from "../state";
import { generateNodeText, toNodeError } from "./shared";

const SYSTEM_PROMPT =
  "You are a software architect. Review the given PRD and outline the " +
  "architecture, key risks, and feasibility concerns for building it.";

export async function architectureReviewAgent(state: GraphState): Promise<GraphStateUpdate> {
  try {
    const content = await generateNodeText(
      SYSTEM_PROMPT,
      `PRD:\n${state.prd?.content ?? ""}`,
    );
    return { architectureReview: { content } };
  } catch (error) {
    return { errors: [toNodeError("architectureReviewAgent", error)] };
  }
}
