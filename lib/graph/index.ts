import { END, START, StateGraph } from "@langchain/langgraph";

import { architectureReviewAgent } from "./nodes/architectureReviewAgent";
import { assembler } from "./nodes/assembler";
import { experimentDesignAgent } from "./nodes/experimentDesignAgent";
import { prdAgent } from "./nodes/prdAgent";
import { roadmapAgent } from "./nodes/roadmapAgent";
import { supervisor } from "./nodes/supervisor";
import { userStoryAgent } from "./nodes/userStoryAgent";
import { GraphAnnotation } from "./state";

/**
 * `supervisor -> prdAgent -> [userStoryAgent, architectureReviewAgent,
 * experimentDesignAgent] -> roadmapAgent -> assembler -> END`.
 * See ARCHITECTURE.md §1 for why PRD runs alone before the fan-out.
 */
export function buildGraph() {
  return new StateGraph(GraphAnnotation)
    .addNode("supervisor", supervisor)
    .addNode("prdAgent", prdAgent)
    .addNode("userStoryAgent", userStoryAgent)
    .addNode("architectureReviewAgent", architectureReviewAgent)
    .addNode("experimentDesignAgent", experimentDesignAgent)
    .addNode("roadmapAgent", roadmapAgent)
    .addNode("assembler", assembler)
    .addEdge(START, "supervisor")
    .addEdge("supervisor", "prdAgent")
    .addEdge("prdAgent", "userStoryAgent")
    .addEdge("prdAgent", "architectureReviewAgent")
    .addEdge("prdAgent", "experimentDesignAgent")
    .addEdge("userStoryAgent", "roadmapAgent")
    .addEdge("architectureReviewAgent", "roadmapAgent")
    .addEdge("experimentDesignAgent", "roadmapAgent")
    .addEdge("roadmapAgent", "assembler")
    .addEdge("assembler", END)
    .compile();
}

export type CompiledGraph = ReturnType<typeof buildGraph>;
