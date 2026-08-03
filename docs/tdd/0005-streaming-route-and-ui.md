# TDD 0005 — Streaming Route and UI

**Depends on:** 0002 (graph), 0003 (checkpointing), 0004 (MCP-wired nodes) —
this phase makes the fully-wired graph reachable by a visitor.
**Unblocks:** 0006 (rate limiting sits in front of this route), 0007 (run
trace links from this UI).

## Context

This is where the project becomes an actually-runnable product rather than
a library. `ARCHITECTURE.md` §5 establishes a single synchronous streaming
Route Handler, no background jobs, `maxDuration: 300` — a load-bearing
constraint given the parallelized graph shape from 0002.

## Scope

**In scope:**
- `app/api/generate/route.ts`: a `POST` handler, Node.js runtime (not Edge —
  the Postgres driver and MCP servers need real Node APIs), `export const
  maxDuration = 300`. Accepts `{ input: string }`, runs the graph from 0002
  (with 0003's checkpointer, 0004's MCP-wired nodes), and streams progress
  events (supervisor routing decision, per-node start/complete status, MCP
  tool calls made) to the client via LangGraph's event stream piped through
  the Vercel AI SDK's data-stream protocol.
- `app/page.tsx` (or equivalent): a free-text input ("Describe the product
  or feature you want a plan for") plus 2-3 clickable example prompts
  (`ARCHITECTURE.md` UI decision — lowers friction for a visitor who just
  wants to see it work).
- A live-updating view of the in-progress run: which node is currently
  running, which have completed, and a log of MCP tool calls as they
  happen — consuming the streamed events from the route handler.
- A final output view once the run completes: the five deliverables (PRD,
  User Stories, Architecture Review, Experiment Design, Roadmap) rendered
  as distinct sections (tabs or an accordion — implementer's choice).
- Error-state UI: if the graph run completes with entries in `state.errors`
  (0002's graceful-degradation contract), the affected section(s) show the
  degraded/unavailable note rather than silently omitting them.

**Out of scope (later TDDs):**
- Rate-limit enforcement and its UI messaging (0006) — this phase's route
  handler doesn't yet reject requests, though 0006 will add that check at
  the top of the same handler.
- The "view trace" link and trace display (0007).
- The "what's next" / future-work UI note (0009).

## Interfaces

```ts
// app/api/generate/route.ts
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(req: Request): Promise<Response>; // streaming response
```

## Acceptance criteria (test-first)

- A mocked test for the route handler asserts it invokes the graph from
  0002 with the request body's `input` and that the response is a
  streaming response (assert headers/shape, with the graph itself mocked —
  don't make real model/MCP calls in this test).
- A mocked test asserts that when the graph run produces `state.errors`
  entries, the streamed/final response reflects the degraded section(s)
  rather than omitting or crashing on them.
- Component-level tests for the UI's distinct states (idle, running with
  partial progress, completed with all five sections, completed with one
  degraded section) using fixture event streams — no real network calls.
- **Manual verification** (documented, not a CI test, since real streaming
  UX over a real 300s-capable run isn't practical to assert in an automated
  suite): a real end-to-end run against real Haiku 4.5 and the real MCP
  servers from 0004, confirming the live progress view updates as expected
  and total wall-clock stays comfortably under the 300s ceiling given the
  parallelized fan-out.

## Notes for the implementing session

- This is the first phase where the "single synchronous streaming route,
  no polling" decision from `ARCHITECTURE.md` §5 actually gets exercised —
  if the manual verification shows wall-clock time is uncomfortably close to
  300s, that's a signal to revisit prompt/effort tuning on the sub-agents
  (cheaper/faster calls) before considering an architecture change, not a
  reason to introduce background jobs.
