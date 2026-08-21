import type { GraphNodeName } from "../../lib/graph/progress";

/** Display order/labels for the graph's nodes — shared by ProgressLog and (indirectly) ResultView's section-to-node mapping. */
export const NODE_ORDER: GraphNodeName[] = [
  "supervisor",
  "clarificationGate",
  "prdAgent",
  "prdApprovalGate",
  "userStoryAgent",
  "architectureReviewAgent",
  "experimentDesignAgent",
  "roadmapAgent",
  "assembler",
];

export const NODE_LABEL: Record<GraphNodeName, string> = {
  supervisor: "Supervisor",
  clarificationGate: "Clarifying Questions",
  prdAgent: "PRD",
  prdApprovalGate: "PRD Approval",
  userStoryAgent: "User Stories",
  architectureReviewAgent: "Architecture Review",
  experimentDesignAgent: "Experiment Design",
  roadmapAgent: "Roadmap",
  assembler: "Assembler",
};
