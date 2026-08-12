/**
 * Manual, real-Postgres + real-model wiring proof for TDD 0010 — not part of
 * the mocked test suite. Sibling to scripts/checkpoint-roundtrip.ts, which
 * proves the same durability for `buildGraph`'s `interruptAfter` option; this
 * one proves it for the thing the product actually uses: a node calling
 * LangGraph's `interrupt()`.
 *
 * It submits a deliberately vague request, asserts the run parks at
 * `clarificationGate` with real questions from a real triage model call,
 * then resumes it through a second, independently-constructed checkpointer —
 * standing in for the separate HTTP request the browser actually makes — and
 * asserts the answers reached the PRD. Requires migrations to have been
 * applied (`npx tsx scripts/migrate.ts`) and a real model key. Run with:
 *
 *   DATABASE_URL=postgres://... ANTHROPIC_API_KEY=sk-... npx tsx scripts/clarification-roundtrip.ts
 */
import { randomUUID } from "node:crypto";

import { Command } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import { buildGraph } from "../lib/graph/index";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Set DATABASE_URL to run this script.");
}

// Vague on purpose: the whole point is to get the real triage model to
// decide this can't be planned against as written.
const REQUEST = "an app for teams";
const ANSWER = "Freelance design studios coordinating client feedback rounds";

const config = { configurable: { thread_id: randomUUID() } };

const checkpointer = PostgresSaver.fromConnString(connectionString);
await checkpointer.setup();

const graph = buildGraph({ checkpointer });
const paused = await graph.invoke({ request: REQUEST }, config);

const interrupts = (paused as { __interrupt__?: { value?: { questions?: string[] } }[] }).__interrupt__;
const questions = interrupts?.flatMap((entry) => entry.value?.questions ?? []) ?? [];
if (questions.length === 0) {
  throw new Error(
    `Expected the supervisor to ask about a deliberately vague request, but it asked nothing. ` +
      `Either the triage prompt has drifted or the model judged "${REQUEST}" specific enough.`,
  );
}
if (paused.prd !== null) {
  throw new Error("Paused before the PRD was written, but a PRD exists — the gate ran too late.");
}

console.log(`Paused with ${questions.length} question(s):`);
for (const question of questions) console.log(`  - ${question}`);

const snapshot = await graph.getState(config);
if (snapshot.next[0] !== "clarificationGate") {
  throw new Error(`Expected the thread to be parked at clarificationGate, got ${snapshot.next.join(", ") || "nothing"}.`);
}

// A second, freshly-constructed checkpointer/graph pair stands in for the
// separate request that carries the visitor's answers — the same separation
// scripts/checkpoint-roundtrip.ts uses to prove the pause is durable rather
// than held in memory.
const resumedCheckpointer = PostgresSaver.fromConnString(connectionString);
const resumedGraph = buildGraph({ checkpointer: resumedCheckpointer });
const answers = questions.map((_, index) => (index === 0 ? ANSWER : ""));
const finalState = await resumedGraph.invoke(new Command({ resume: answers }), config);

if (finalState.result === null) {
  throw new Error("Resumed run did not complete.");
}
if (finalState.clarifications.length !== 1 || finalState.clarifications[0].answer !== ANSWER) {
  throw new Error(
    `Expected exactly the one answered question to survive the resume, got ${JSON.stringify(finalState.clarifications)}.`,
  );
}

console.log(
  "Clarification round-trip OK: a real interrupt parked the run in Postgres, a separately " +
    "constructed graph resumed it with the answer, and the run completed.",
);

await checkpointer.end();
await resumedCheckpointer.end();
process.exit(0);
