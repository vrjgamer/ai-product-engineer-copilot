import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { END, START, StateGraph } from "@langchain/langgraph";

import { architectureReviewAgent } from "./nodes/architectureReviewAgent";
import { assembler } from "./nodes/assembler";
import { clarificationGate } from "./nodes/clarificationGate";
import { experimentDesignAgent } from "./nodes/experimentDesignAgent";
import { prdAgent } from "./nodes/prdAgent";
import { prdApprovalGate } from "./nodes/prdApprovalGate";
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
 * `supervisor -> (clarificationGate ->)? prdAgent -> prdApprovalGate ->
 * (revise: back to prdAgent | approve: [userStoryAgent,
 * architectureReviewAgent, experimentDesignAgent]) -> roadmapAgent ->
 * assembler -> END`.
 *
 * See ARCHITECTURE.md §1 for why PRD runs alone before the fan-out, and §9
 * for the clarification pause (TDD 0010). Two conditional edges now: the
 * supervisor's (whether to pause for clarifying questions at all) and
 * `prdApprovalGate`'s (approve vs. revise) — the latter is the graph's one
 * cycle, looping back to `prdAgent` until the user approves.
 */
export function buildGraph(options: BuildGraphOptions = {}) {
  return new StateGraph(GraphAnnotation)
    .addNode("supervisor", instrumented("supervisor", supervisor))
    .addNode("clarificationGate", instrumented("clarificationGate", clarificationGate))
    .addNode("prdAgent", instrumented("prdAgent", prdAgent))
    .addNode("prdApprovalGate", instrumented("prdApprovalGate", prdApprovalGate))
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
    // Pause for answers only when the supervisor actually produced
    // questions (TDD 0010). With none — the common case — this is the same
    // static hop to `prdAgent` TDD 0002 had.
    .addConditionalEdges(
      "supervisor",
      (state: GraphState) =>
        state.clarifyingQuestions.length > 0 ? "clarificationGate" : "prdAgent",
      ["clarificationGate", "prdAgent"],
    )
    .addEdge("clarificationGate", "prdAgent")
    .addEdge("prdAgent", "prdApprovalGate")
    // The graph's one cycle: an unapproved draft routes back to `prdAgent`
    // for revision rather than forward, looping until the user approves.
    .addConditionalEdges(
      "prdApprovalGate",
      (state: GraphState) =>
        state.prdApproved
          ? ["userStoryAgent", "architectureReviewAgent", "experimentDesignAgent"]
          : ["prdAgent"],
      ["userStoryAgent", "architectureReviewAgent", "experimentDesignAgent", "prdAgent"],
    )
    .addEdge("userStoryAgent", "roadmapAgent")
    .addEdge("architectureReviewAgent", "roadmapAgent")
    .addEdge("experimentDesignAgent", "roadmapAgent")
    .addEdge("roadmapAgent", "assembler")
    .addEdge("assembler", END)
    .compile({ checkpointer: options.checkpointer, interruptAfter: options.interruptAfter });
}

export type CompiledGraph = ReturnType<typeof buildGraph>;
