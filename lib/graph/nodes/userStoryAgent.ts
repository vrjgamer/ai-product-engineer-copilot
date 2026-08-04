import { formatDocsContext, searchDocsTool } from "../../../mcp/tools";
import type { GraphState, GraphStateUpdate } from "../state";
import { generateNodeText, toNodeError, tryTool, withDegradedNote } from "./shared";

const SYSTEM_PROMPT =
  "You are a product analyst. Write user stories (as a <role>, I want <goal>, " +
  "so that <benefit>) that satisfy the given PRD.";

export async function userStoryAgent(state: GraphState): Promise<GraphStateUpdate> {
  const prdContent = state.prd?.content ?? "";
  const docs = await tryTool("userStoryAgent", () => searchDocsTool(prdContent));

  try {
    const promptParts = [`PRD:\n${prdContent}`];
    const docsContext = docs.value ? formatDocsContext(docs.value) : "";
    if (docsContext) promptParts.push(docsContext);

    const rawContent = await generateNodeText(SYSTEM_PROMPT, promptParts.join("\n\n"));
    const content = withDegradedNote(rawContent, "docs-store search", docs.error !== null);

    return docs.error ? { userStories: { content }, errors: [docs.error] } : { userStories: { content } };
  } catch (error) {
    const errors = docs.error
      ? [docs.error, toNodeError("userStoryAgent", error)]
      : [toNodeError("userStoryAgent", error)];
    return { errors };
  }
}
