import { interrupt } from "@langchain/langgraph";

import type { GraphState, GraphStateUpdate } from "../state";

/** The payload `interrupt()` surfaces to the route handler, which forwards it as a `prd-approval-request` stream event. */
export interface PrdApprovalRequest {
  type: "prd-approval";
  prd: string;
}

/** What the client resumes with: approve outright, or send it back with an optional note on what to change. */
export interface PrdApprovalResume {
  approved: boolean;
  feedback?: string;
}

/**
 * The second pause point in the graph: once `prdAgent` drafts a PRD, the run
 * parks here until the user approves it or sends it back with feedback.
 * Approving continues to the fan-out; feedback routes back to `prdAgent` for
 * a revised draft, which lands at this same gate again — a loop, not a
 * one-shot pause like `clarificationGate`'s.
 *
 * Mirrors `clarificationGate`'s shape exactly, for the same reason: a node
 * that interrupts re-runs from the top on resume, so nothing but the
 * `interrupt()` call belongs here — any work above it would be paid for
 * again on every revision.
 */
export async function prdApprovalGate(state: GraphState): Promise<GraphStateUpdate> {
  const decision = interrupt<PrdApprovalRequest, PrdApprovalResume>({
    type: "prd-approval",
    prd: state.prd?.content ?? "",
  });

  const approved = decision?.approved === true;
  const feedback = !approved && typeof decision?.feedback === "string" ? decision.feedback.trim() : "";

  return {
    prdApproved: approved,
    prdFeedback: feedback.length > 0 ? feedback : null,
  };
}
