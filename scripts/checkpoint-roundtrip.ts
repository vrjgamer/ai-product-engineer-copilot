/**
 * Manual, real-Postgres wiring proof for TDD 0003 — not part of the mocked
 * test suite. Runs the graph from TDD 0002 with the Postgres checkpointer
 * attached, then reads the same thread's state back through a second,
 * independently-constructed checkpointer (standing in for a fresh process)
 * and asserts it matches — proving state is durably persisted rather than
 * only living in the process that ran the graph. Requires migrations to
 * have been applied (`npx tsx scripts/migrate.ts`) and a real model key. Run
 * with:
 *
 *   DATABASE_URL=postgres://... ANTHROPIC_API_KEY=sk-... npx tsx scripts/checkpoint-roundtrip.ts
 */
import { randomUUID } from "node:crypto";

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import { buildGraph } from "../lib/graph/index";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Set DATABASE_URL to run this script.");
}

const config = { configurable: { thread_id: randomUUID() } };

const checkpointer = PostgresSaver.fromConnString(connectionString);
await checkpointer.setup();

const graph = buildGraph({ checkpointer });
const finalState = await graph.invoke({ request: "Build a todo app" }, config);

// A second, freshly-constructed checkpointer/graph pair stands in for a new
// process reading the same Postgres-backed thread.
const resumedCheckpointer = PostgresSaver.fromConnString(connectionString);
const resumedGraph = buildGraph({ checkpointer: resumedCheckpointer });
const resumedState = await resumedGraph.getState(config);

if (resumedState.values.result === null) {
  throw new Error("Resumed state has no result — checkpoint was not persisted.");
}
if (JSON.stringify(resumedState.values.result) !== JSON.stringify(finalState.result)) {
  throw new Error("Resumed state does not match the completed run's state.");
}

console.log("Checkpoint round-trip OK: resumed state matches the completed run.");

await checkpointer.end();
await resumedCheckpointer.end();
process.exit(0);
