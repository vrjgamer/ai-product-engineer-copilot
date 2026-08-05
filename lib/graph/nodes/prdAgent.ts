import { formatDocsContext, searchDocsTool } from "../../../mcp/tools";
import type { GraphState, GraphStateUpdate } from "../state";
import { generateNodeText, toNodeError, tryTool, withDegradedNote } from "./shared";

const SYSTEM_PROMPT =
  "You are a product manager. Write a concise PRD (Product Requirements Document) " +
  "for the product or feature the user describes.";

export async function prdAgent(state: GraphState): Promise<GraphStateUpdate> {
  const docs = await tryTool("prdAgent", () => searchDocsTool(state.request));

  try {
    const promptParts = [`Request:\n${state.request}`];
    const docsContext = docs.value ? formatDocsContext(docs.value) : "";
    if (docsContext) promptParts.push(docsContext);

    const rawContent = await generateNodeText(SYSTEM_PROMPT, promptParts.join("\n\n"));
    const content = withDegradedNote(rawContent, "docs-store search", docs.error !== null);

    return docs.error ? { prd: { content }, errors: [docs.error] } : { prd: { content } };
  } catch (error) {
    const errors = docs.error
      ? [docs.error, toNodeError("prdAgent", error)]
      : [toNodeError("prdAgent", error)];
    return { errors };
  }
}
