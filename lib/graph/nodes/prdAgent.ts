import type { GraphState, GraphStateUpdate } from "../state";
import { generateNodeText, toNodeError } from "./shared";

const SYSTEM_PROMPT =
  "You are a product manager. Write a concise PRD (Product Requirements Document) " +
  "for the product or feature the user describes.";

export async function prdAgent(state: GraphState): Promise<GraphStateUpdate> {
  try {
    const content = await generateNodeText(SYSTEM_PROMPT, state.request);
    return { prd: { content } };
  } catch (error) {
    return { errors: [toNodeError("prdAgent", error)] };
  }
}
