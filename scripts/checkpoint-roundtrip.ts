/**
 * Manual, real-Postgres wiring proof for TDD 0003 — not part of the mocked
 * test suite. Interrupts the graph from TDD 0002 right after `prdAgent`
 * (before the fan-out/roadmap/assembler nodes run), then resumes it through
 * a second, independently-constructed checkpointer — standing in for a
 * fresh process — and asserts the run continues from the interrupted state
 * rather than restarting: `prd` after resuming must be byte-identical to
 * `prd` at the interrupt point, which a re-run of prdAgent's real model call
 * would be very unlikely to produce by chance. Requires migrations to have
 * been applied (`npx tsx scripts/migrate.ts`) and a real model key. Run
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

const interruptedGraph = buildGraph({ checkpointer, interruptAfter: ["prdAgent"] });
await interruptedGraph.invoke({ request: "Build a todo app" }, config);

const interruptedState = await interruptedGraph.getState(config);
if (interruptedState.values.prd === null) {
  throw new Error("Expected prd to be set after interrupting past prdAgent.");
}
if (interruptedState.values.result !== null) {
  throw new Error("Run completed before the interrupt point — nothing to resume.");
}
const prdBeforeResume = interruptedState.values.prd;

// A second, freshly-constructed checkpointer/graph pair stands in for a new
// process picking the same thread back up. Passing `null` as input resumes
// from the last checkpoint instead of starting a new run.
const resumedCheckpointer = PostgresSaver.fromConnString(connectionString);
const resumedGraph = buildGraph({ checkpointer: resumedCheckpointer });
const finalState = await resumedGraph.invoke(null, config);

if (finalState.result === null) {
  throw new Error("Resumed run did not complete.");
}
if (JSON.stringify(finalState.prd) !== JSON.stringify(prdBeforeResume)) {
  throw new Error(
    "prd changed after resuming — the run re-ran prdAgent instead of continuing from the checkpoint.",
  );
}

console.log(
  "Checkpoint round-trip OK: resumed run continued from the interrupted state instead of restarting.",
);

await checkpointer.end();
await resumedCheckpointer.end();
process.exit(0);
