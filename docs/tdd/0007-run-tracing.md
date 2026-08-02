# TDD 0007 — Run Tracing

**Depends on:** 0002 (graph nodes to instrument), 0003 (Postgres).
**Unblocks:** nothing downstream — can land any time after 0002/0003; ties
into 0005's UI for the "view trace" link.

## Context

`ARCHITECTURE.md` §7: a lightweight run trace, not the old project's full
eval/rigor layer (explicitly deferred — see §9 and TDD 0009). This phase
gets most of the practical debugging value — what a run actually did, how
long each node took, what it cost — at a fraction of the build cost of a
golden-set/LLM-as-judge pipeline.

## Scope

**In scope:**
- A `run_traces` table via its own migration: one row per graph run, with
  at minimum `run_id`, `started_at`, `ended_at`, `nodes` (JSONB array of
  `{ node, latencyMs, inputTokens, outputTokens, mcpCalls }`), and
  `total_cost_usd`.
- Instrumentation on each graph node (from 0002): record start/end time and,
  where the node made a model call, the token usage from the Vercel AI
  SDK's `generateText`/`streamText` result (`result.usage`) — real counts,
  not estimates, matching the old project's "cost is computed, not
  estimated" discipline (`ARCHITECTURE.md` of the previous implementation).
- Persisting one trace row at the end of a graph run (success or partial
  failure — a run with `state.errors` entries still gets a trace).
- A "view trace" link on the completed-run UI (extending 0005) leading to a
  simple page/view rendering the trace: per-node latency, token usage, and
  which MCP tools were called, in a table or timeline.

**Out of scope:**
- Alerting, dashboards, or any third-party observability integration.
- The full eval/rigor layer (golden-set regression, LLM-as-judge, failure
  taxonomy) — explicitly deferred, see TDD 0009.

## Interfaces

```ts
// lib/tracing/record.ts
export interface NodeTrace {
  node: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  mcpCalls: string[];
}

export interface RunTrace {
  runId: string;
  startedAt: string;
  endedAt: string;
  nodes: NodeTrace[];
  totalCostUsd: number;
}

export async function recordRunTrace(trace: RunTrace): Promise<void>;
```

## Acceptance criteria (test-first)

- A unit test asserts a mocked graph run (from 0002, with mocked model
  calls returning known token counts) produces a `RunTrace` with correct
  per-node latency ordering and token counts.
- A unit test asserts `totalCostUsd` is computed from the actual recorded
  token counts and the current model's per-token pricing, not a flat
  estimate.
- A unit test asserts a run with `state.errors` entries still produces a
  complete trace (tracing isn't skipped on partial failure).
- A component test for the trace-view page asserts it renders a fixture
  `RunTrace` correctly (per-node latency, tokens, MCP calls listed).

## Notes for the implementing session

- Keep the per-token pricing table small and explicit (just the models this
  project actually supports via 0001's provider abstraction) rather than
  pulling in a pricing API — pricing changes rarely enough that a hardcoded,
  clearly-commented table is the right level of engineering here.
