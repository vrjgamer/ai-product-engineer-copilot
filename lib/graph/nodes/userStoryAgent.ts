import type { GraphState, GraphStateUpdate } from "../state";
import { generateNodeText, toNodeError } from "./shared";

const SYSTEM_PROMPT =
  "You are a product analyst. Write user stories (as a <role>, I want <goal>, " +
  "so that <benefit>) that satisfy the given PRD.";

export async function userStoryAgent(state: GraphState): Promise<GraphStateUpdate> {
  try {
    const content = await generateNodeText(
      SYSTEM_PROMPT,
      `PRD:\n${state.prd?.content ?? ""}`,
    );
    return { userStories: { content } };
  } catch (error) {
    return { errors: [toNodeError("userStoryAgent", error)] };
  }
}
