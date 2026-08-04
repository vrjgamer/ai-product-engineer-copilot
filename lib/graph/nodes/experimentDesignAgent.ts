import type { GraphState, GraphStateUpdate } from "../state";
import { generateNodeText, toNodeError } from "./shared";

const SYSTEM_PROMPT =
  "You are a product data scientist. Design an experiment (hypothesis, " +
  "metrics, and validation plan) to test whether the given PRD succeeds.";

export async function experimentDesignAgent(state: GraphState): Promise<GraphStateUpdate> {
  try {
    const content = await generateNodeText(
      SYSTEM_PROMPT,
      `PRD:\n${state.prd?.content ?? ""}`,
    );
    return { experimentDesign: { content } };
  } catch (error) {
    return { errors: [toNodeError("experimentDesignAgent", error)] };
  }
}
