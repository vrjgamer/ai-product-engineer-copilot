import { formatDocsContext, formatRepoStats, getRepoStatsTool, searchDocsTool } from "../../../mcp/tools";
import type { GraphState, GraphStateUpdate, NodeError } from "../state";
import { generateNodeText, toNodeError, tryTool, withDegradedNote } from "./shared";

const SYSTEM_PROMPT =
  "You are a software architect. Review the given PRD and outline the " +
  "architecture, key risks, and feasibility concerns for building it.";

export async function architectureReviewAgent(state: GraphState): Promise<GraphStateUpdate> {
  const prdContent = state.prd?.content ?? "";
  const [docs, stats] = await Promise.all([
    tryTool("architectureReviewAgent", () => searchDocsTool(prdContent)),
    tryTool("architectureReviewAgent", () => getRepoStatsTool()),
  ]);
  const toolErrors = [docs.error, stats.error].filter((error): error is NodeError => error !== null);

  try {
    const promptParts = [`PRD:\n${prdContent}`];
    const docsContext = docs.value ? formatDocsContext(docs.value) : "";
    if (docsContext) promptParts.push(docsContext);
    if (stats.value) promptParts.push(formatRepoStats(stats.value));

    const rawContent = await generateNodeText(SYSTEM_PROMPT, promptParts.join("\n\n"));
    const content = withDegradedNote(rawContent, "docs-store search and/or analytics", toolErrors.length > 0);

    return toolErrors.length > 0
      ? { architectureReview: { content }, errors: toolErrors }
      : { architectureReview: { content } };
  } catch (error) {
    return { errors: [...toolErrors, toNodeError("architectureReviewAgent", error)] };
  }
}
