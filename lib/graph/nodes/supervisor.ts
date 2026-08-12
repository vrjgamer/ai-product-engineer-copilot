import type { GraphState, GraphStateUpdate } from "../state";
import { generateNodeText, toNodeError } from "./shared";

/**
 * Kept small on purpose: the point of pausing is to unblock the PRD, not to
 * interview the visitor. Three is enough to pin down audience, scope, and
 * the one constraint that usually matters, and it fits on screen without a
 * scroll.
 */
export const MAX_CLARIFYING_QUESTIONS = 3;

const SYSTEM_PROMPT =
  // The "You are a <role>" phrase is deliberately distinct from every other
  // node's (lib/graph/index.test.ts routes fixture responses by matching on
  // it), and deliberately avoids repeating another node's role name anywhere
  // else in the prompt.
  "You are a product discovery lead triaging an incoming request. " +
  "Decide whether it is specific enough to write a useful PRD from as " +
  "written. Reply with a JSON array of at most " +
  `${MAX_CLARIFYING_QUESTIONS} short clarifying questions — one sentence each, ` +
  "no numbering — that would materially change the plan if answered. If the " +
  "request is already specific enough to plan against, reply with an empty " +
  "array. Reply with the JSON array and nothing else.";

/**
 * Entry point of the graph, and the one routing decision it actually makes
 * (ARCHITECTURE.md §1): judge whether `request` is answerable as written and,
 * if not, produce the questions `clarificationGate` will pause on. Returning
 * no questions routes straight to `prdAgent` — the common path, unchanged
 * from TDD 0002.
 *
 * The model call lives here rather than in the gate because a node that
 * interrupts re-runs from the top on resume (TDD 0010): generating the
 * questions in the gate would pay for this call twice and could return
 * different questions than the ones the user just answered.
 */
export async function supervisor(state: GraphState): Promise<GraphStateUpdate> {
  try {
    const raw = await generateNodeText(SYSTEM_PROMPT, `Request:\n${state.request}`);
    return { clarifyingQuestions: parseQuestions(raw) };
  } catch (error) {
    // Triage failing is not worth failing the run over — proceed unclarified,
    // exactly as v1 did, but record it so the degradation is visible in the
    // result rather than silent (same contract as ARCHITECTURE.md §3's MCP
    // degradation).
    return { clarifyingQuestions: [], errors: [toNodeError("supervisor", error)] };
  }
}

/**
 * Text models wrap JSON in fences and prose more often than not, and this is
 * a triage step: "couldn't parse" and "nothing to ask" are the same outcome —
 * run unclarified. Never throws.
 */
export function parseQuestions(raw: string): string[] {
  const parsed = parseJsonArray(raw);
  if (!parsed) return [];

  return parsed
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, MAX_CLARIFYING_QUESTIONS);
}

function parseJsonArray(raw: string): unknown[] | null {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end <= start) return null;

  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
