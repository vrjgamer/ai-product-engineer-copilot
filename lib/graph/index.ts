import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { END, START, StateGraph } from "@langchain/langgraph";

import { architectureReviewAgent } from "./nodes/architectureReviewAgent";
import { assembler } from "./nodes/assembler";
import { experimentDesignAgent } from "./nodes/experimentDesignAgent";
import { prdAgent } from "./nodes/prdAgent";
import { roadmapAgent } from "./nodes/roadmapAgent";
import { supervisor } from "./nodes/supervisor";
import { userStoryAgent } from "./nodes/userStoryAgent";
import type { GraphNodeName } from "./progress";
import { withNodeProgress } from "./progress";
import { GraphAnnotation } from "./state";
import type { GraphState, GraphStateUpdate } from "./state";
import { withNodeTracing } from "../tracing/collect";

export type { GraphNodeName } from "./progress";

/**
 * Composes TDD 0005's progress emission and TDD 0007's trace collection
 * around one node function — two independent `AsyncLocalStorage`-based
 * wrappers (see `lib/graph/progress.ts` and `lib/tracing/collect.ts`), each
 * a no-op unless its own run wrapper (`withProgressEmitter` /
 * `withRunTracing`) is active.
 */
function instrumented(
  node: GraphNodeName,
  fn: (state: GraphState) => Promise<GraphStateUpdate>,
): (state: GraphState) => Promise<GraphStateUpdate> {
  const withProgress = withNodeProgress(node, fn);
  return (state: GraphState) => withNodeTracing(node, () => withProgress(state));
}

export interface BuildGraphOptions {
  /**
   * Persists graph state per `thread_id` (passed via `invoke`'s config) so a
   * run survives across requests/process restarts. See TDD 0003 — omit for
   * the mocked test suite, pass `getCheckpointer()` (lib/db/checkpointer.ts)
   * in real usage.
   */
  checkpointer?: BaseCheckpointSaver;
  /**
   * Pauses the run after the named nodes complete, before continuing —
   * requires `checkpointer`. Used by scripts/checkpoint-roundtrip.ts to
   * simulate a process restart mid-run.
   */
  interruptAfter?: GraphNodeName[];
}

/**
 * `supervisor -> prdAgent -> [userStoryAgent, architectureReviewAgent,
 * experimentDesignAgent] -> roadmapAgent -> assembler -> END`.
 * See ARCHITECTURE.md §1 for why PRD runs alone before the fan-out.
 */
export function buildGraph(options: BuildGraphOptions = {}) {
  return new StateGraph(GraphAnnotation)
    .addNode("supervisor", instrumented("supervisor", supervisor))
    .addNode("prdAgent", instrumented("prdAgent", prdAgent))
    .addNode("userStoryAgent", instrumented("userStoryAgent", userStoryAgent))
    .addNode(
      "architectureReviewAgent",
      instrumented("architectureReviewAgent", architectureReviewAgent),
    )
    .addNode(
      "experimentDesignAgent",
      instrumented("experimentDesignAgent", experimentDesignAgent),
    )
    .addNode("roadmapAgent", instrumented("roadmapAgent", roadmapAgent))
    .addNode("assembler", instrumented("assembler", assembler))
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
    .compile({ checkpointer: options.checkpointer, interruptAfter: options.interruptAfter });
}

export type CompiledGraph = ReturnType<typeof buildGraph>;
