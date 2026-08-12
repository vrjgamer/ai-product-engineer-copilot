import { interrupt } from "@langchain/langgraph";

import type { Clarification, GraphState, GraphStateUpdate } from "../state";

/** The payload `interrupt()` surfaces to the route handler, which forwards it as a `clarification-request` stream event. */
export interface ClarificationRequest {
  questions: string[];
}

/**
 * The one pause point in the graph (TDD 0010). Its whole body is
 * LangGraph's `interrupt()`: on the first pass it throws `GraphInterrupt`,
 * parking the run at a durable checkpoint with the questions
 * `supervisor` already committed to state; on resume it returns the answers
 * the user submitted and the run continues into `prdAgent`.
 *
 * Nothing else lives in this function deliberately — a node that interrupts
 * re-runs from the top when resumed, so any work above the `interrupt()`
 * call would be paid for twice.
 */
export async function clarificationGate(state: GraphState): Promise<GraphStateUpdate> {
  const answers = interrupt<ClarificationRequest, unknown>({
    questions: state.clarifyingQuestions,
  });

  return { clarifications: pairAnswers(state.clarifyingQuestions, answers) };
}

/**
 * Pairs each question with its answer positionally, dropping unanswered
 * ones. Skipping is a first-class outcome — a user who answers nothing
 * resumes with no clarifications rather than with a list of empty strings
 * that would only add noise to `prdAgent`'s prompt.
 */
function pairAnswers(questions: string[], answers: unknown): Clarification[] {
  const list = Array.isArray(answers) ? answers : [];

  return questions
    .map((question, index) => ({
      question,
      answer: typeof list[index] === "string" ? list[index].trim() : "",
    }))
    .filter(({ answer }) => answer.length > 0);
}
