import { formatDocsContext, searchDocsTool } from "../../../mcp/tools";
import type { Clarification, GraphState, GraphStateUpdate } from "../state";
import { generateNodeText, toNodeError, tryTool, withDegradedNote } from "./shared";

/** Renders the answers from `clarificationGate` as prompt context — empty string when the run wasn't clarified. */
export function formatClarifications(clarifications: Clarification[]): string {
  if (clarifications.length === 0) return "";

  const lines = clarifications.map(({ question, answer }) => `- ${question}\n  ${answer}`);
  return `The user answered these clarifying questions:\n${lines.join("\n")}`;
}

const SYSTEM_PROMPT =
  "You are a product manager. Write a concise PRD (Product Requirements Document) " +
  "for the product or feature the user describes.";

export async function prdAgent(state: GraphState): Promise<GraphStateUpdate> {
  const docs = await tryTool("prdAgent", () => searchDocsTool(state.request));

  try {
    const promptParts = [`Request:\n${state.request}`];
    // TDD 0010: the answers the supervisor paused for land here and nowhere
    // else — every other deliverable reads the PRD, so folding them in once
    // propagates them through the whole graph.
    const clarifications = formatClarifications(state.clarifications);
    if (clarifications) promptParts.push(clarifications);
    // TDD (PRD approval loop): a draft sent back from `prdApprovalGate`
    // lands here as feedback on the *previous* draft, not a fresh
    // instruction — folded in only on a revision pass.
    if (state.prdFeedback) {
      promptParts.push(
        `A previous draft of this PRD was sent back for revision with this feedback:\n${state.prdFeedback}`,
      );
    }
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
