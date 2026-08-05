import { formatRepoStats, getRepoStatsTool } from "../../../mcp/tools";
import type { GraphState, GraphStateUpdate } from "../state";
import { generateNodeText, toNodeError, tryTool, withDegradedNote } from "./shared";

const SYSTEM_PROMPT =
  "You are a product lead. Produce a sequenced roadmap using the PRD's scope, " +
  "the user stories' work breakdown, the architecture review's feasibility/risk " +
  "notes, and the experiment design's validation plan.";

export async function roadmapAgent(state: GraphState): Promise<GraphStateUpdate> {
  const stats = await tryTool("roadmapAgent", () => getRepoStatsTool());

  try {
    const promptParts = [
      `PRD:\n${state.prd?.content ?? ""}`,
      `User stories:\n${state.userStories?.content ?? "(unavailable)"}`,
      `Architecture review:\n${state.architectureReview?.content ?? "(unavailable)"}`,
      `Experiment design:\n${state.experimentDesign?.content ?? "(unavailable)"}`,
    ];
    if (stats.value) promptParts.push(formatRepoStats(stats.value));

    const rawContent = await generateNodeText(SYSTEM_PROMPT, promptParts.join("\n\n"));
    const content = withDegradedNote(rawContent, "analytics", stats.error !== null);

    return stats.error ? { roadmap: { content }, errors: [stats.error] } : { roadmap: { content } };
  } catch (error) {
    const errors = stats.error
      ? [stats.error, toNodeError("roadmapAgent", error)]
      : [toNodeError("roadmapAgent", error)];
    return { errors };
  }
}
