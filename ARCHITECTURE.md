# Architecture: AI Product Engineer Copilot

A multi-agent graph that generates PRDs, user stories, experiment designs, architecture
reviews, and roadmaps for PMs/founders. This document is the source of truth for every
design decision in this repo.

> **Status.** This document was originally written before any of the rebuild's code
> existed. TDDs 0001-0008 have since shipped, and TDD 0009 was a pass over this document
> (plus `VISION.md` and `README.md`) to reconcile it with what actually got built: file
> paths, table names, and env vars below are now the real ones, and the few places where
> implementation reality diverged from the original plan say so explicitly rather than
> leaving the plan's version standing. TDD 0010 then built the first of the two
> capabilities §9 had deferred — clarifying questions via interrupt/resume — so §1, §5 and
> §9 below describe a graph that can pause. The decisions themselves are unchanged.

**This is a rebuild, not an iteration.** The previous version of this project (hand-rolled
planner/executor loop, fixture-only tests, a scripted/fake "live demo") is being replaced
entirely. The product concept — a PM copilot producing five concrete deliverable types —
was sound and is kept. The engineering was weak: no live model calls anywhere in the
system, no live MCP tool use outside tests, no deployed working backend, no CI, and a
demo that fakes the thing it's supposed to demonstrate. This rebuild's whole premise is
that every one of those is now real.

Stack: TypeScript, Next.js (single app — UI and backend in one project), LangGraph.js
(`@langchain/langgraph`) for orchestration, the Vercel AI SDK (`ai` + `@ai-sdk/*`) for
model calls, the MCP TypeScript SDK for tool servers, Neon Postgres (`pgvector`) for all
persistence, deployed on Vercel's free (Hobby) tier with Fluid Compute.

---

## 1. Agent loop design: supervisor + sub-agent graph, not a linear planner/executor

**Decision: a LangGraph `StateGraph` with a supervisor pattern — one PRD-writing node
first, then three independent sub-agents fanned out in parallel, then a roadmap node
that joins their outputs, then an assembler.**

The old design was an explicit plan-then-execute loop: a `Planner` emitted an ordered,
typed step list; an `Executor` ran it as a linear queue, replanning around failures. That
was a reasonable design for the tool surface it had (two MCP servers, single document
output), but it does not showcase "agent + sub-agent + graph," which is this rebuild's
explicit goal — a linear queue with dependency assertions is not a graph, it's a list.

**The graph shape, and why it isn't a flat fan-out:**

```
Supervisor -> PRDAgent -> [UserStoryAgent, ArchitectureReviewAgent, ExperimentDesignAgent] -> RoadmapAgent -> Assembler
     |            ^           (parallel; join before Roadmap)
     \-> ClarificationGate (TDD 0010; only when the request is too vague to plan against)
```

- **PRD Agent runs first, alone.** Every other deliverable needs to know what's actually
  being built. Writing user stories, reviewing an architecture, or designing an
  experiment against an undefined product is not a sensible parallel branch — it's a
  downstream consumer of one shared artifact. This was the single most important
  correction made during design: an earlier draft of this plan treated all five
  sub-agents as independent parallel branches, which breaks the moment you ask "how does
  the architecture reviewer know what to review?"
- **User Story / Architecture Review / Experiment Design fan out in parallel** once the
  PRD exists in shared graph state. They are genuinely independent of each other — none
  needs another's output, only the PRD's.
- **Roadmap Agent runs last**, after the fan-out joins. It is the one deliverable that
  needs everything else (scope from the PRD, work breakdown from stories, feasibility/
  risk from the architecture review, a validation plan from the experiment design) to
  produce a sequenced timeline.
- **Assembler** merges all five outputs into the final response, playing the same role
  the old `assemble.ts` helpers played for MCP context — merging retrieved/generated
  content into one artifact, just now as a graph node instead of a post-hoc helper.

**As built** (`lib/graph/index.ts`, TDD 0002): `buildGraph()` wires exactly these nodes
and edges, with node implementations in `lib/graph/nodes/` and shared state in
`lib/graph/state.ts`.

The `supervisor` node was, through TDD 0009, explicitly *not* a decision-maker: it made no
model call, and its "routing decision" was a static edge to `prdAgent`. It existed as a
node so richer routing had somewhere to land without changing the graph's shape. TDD 0010
is that richer routing landing: the supervisor now makes one cheap triage call ("is this
request specific enough to write a PRD from?") and the graph's one conditional edge sends
the run either to `clarificationGate` — which pauses for answers (§9) — or straight on to
`prdAgent` as before. The seam paid off exactly as intended: the graph *shape* absorbed a
genuinely new capability without any node contract changing.

Everything after that first hop is still statically wired. The dependency ordering below,
not dynamic dispatch, remains what the graph is buying.

**How sub-agents "know" about each other's decisions**: they don't communicate directly.
LangGraph's `StateGraph` gives every node read/write access to one shared state object
that flows through the graph. A node "knowing" what a prior node decided means reading it
from state, not receiving a message — this is the mechanism that makes the PRD → fan-out
dependency correct without any inter-agent messaging protocol.

**Rejected alternative: flat 5-way fan-out with no dependency ordering.** Rejected
because it produces incoherent output (an architecture review that doesn't know what
architecture is being proposed) and because it's a weaker showcase — a graph whose only
feature is "everything runs in parallel" doesn't demonstrate what a graph buys you over a
list. The PRD → fan-out → Roadmap shape has a real join point, which is also what a
recruiter skimming the code should notice as evidence of actual design, not a template.

---

## 2. Model provider layer: Vercel AI SDK, not LangChain's model wrappers

**Decision: every LLM call inside the graph goes through the Vercel AI SDK's
`generateText`/`streamText` (via `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`),
not `@langchain/anthropic` or another LangChain chat-model class.**

LangGraph nodes are plain async functions — nothing in LangGraph requires calling a
LangChain `BaseChatModel`. Routing every model call through the Vercel AI SDK instead
gives one consistent provider abstraction across both the graph (backend) and the chat
UI (frontend, via the AI SDK's data-stream protocol), rather than LangChain models on the
backend and a separate streaming story on the frontend. Provider selection resolves from
an env var (`MODEL_PROVIDER`, `MODEL_ID`) at a single call site; swapping Anthropic for
OpenAI or Gemini is a config change, not a code change, in every sub-agent node.

**As built** (TDD 0001): `lib/models/provider.ts` is the only file in the codebase that
imports an `@ai-sdk/*` provider package; every node calls `generateNodeText()` in
`lib/graph/nodes/shared.ts`, which calls `getModel()`. Two fidelity notes on the original
plan. First, `streamText` isn't used — nodes call `generateText`, and what streams to the
browser is per-node *progress* (§5), not per-token output; streaming tokens from five
sub-agents into five separate panes was not worth the UI complexity for this product
shape. Second, the frontend does not use `useChat`: the page is a single-shot form, so it
reads the data stream directly (`lib/client/parseProgressStream.ts`). The provider
abstraction claim — one env var, one call site — is real; the "same SDK on both ends"
claim is real but thinner in practice than the original wording suggested.

**Default model: Claude Haiku 4.5** (`claude-haiku-4-5`). Chosen deliberately over a
stronger model because this is a public demo, not a production system optimizing for
output quality — Haiku 4.5 is the cheapest current Claude model ($1/$5 per MTok) and is
sufficient for the kind of structured generation these sub-agents do. Estimated cost is
roughly $0.01-0.04 per full demo run (5 sub-agents × 1-3 calls each), cheaper still with
prompt caching on the shared system prompt.

**Rejected alternative: hardcoding the Anthropic SDK directly in each node.** Rejected
because it would make "provider-agnostic" a documentation claim rather than something
demonstrably true — the point of routing through the Vercel AI SDK is that a demo visitor
(or a future maintainer) can point the same graph at a different provider by changing one
env var, not by touching graph logic.

---

## 3. MCP boundary: two servers, both real data, one external dependency

**Decision: two MCP servers, both backed by real (not fixture) data — a decision made
explicitly during design, correcting an earlier draft that defaulted to fixtures for
safety.**

- **`docs-store` MCP** (`mcp/docs-store/`): real embedding-based search (`pgvector`) over
  an indexed corpus of real markdown docs. As built, that corpus is *this repository's
  own* docs — `ARCHITECTURE.md`, `VISION.md`, `README.md`, and everything under
  `docs/tdd/` — chunked and embedded by `scripts/index-docs.ts` into the `doc_chunks`
  table. Returns cited passages, same anti-hallucination discipline as the old project
  (`[source:<id>]` tags, never fabricated).
- **`analytics` MCP** (`mcp/analytics/`): real GitHub repository statistics (stars, open
  issues, commit velocity, PR merge rate) via the GitHub API for the repo named by
  `GITHUB_DEMO_REPO`, cached in Neon Postgres (`github_stats_cache`) with a 1-hour TTL so
  the demo isn't hammering GitHub's API on every run.

**Which nodes call what, as built:** `search_docs` is called by `prdAgent`,
`userStoryAgent`, and `architectureReviewAgent` (each grounding its own deliverable);
`get_repo_stats` is called by `architectureReviewAgent` and `roadmapAgent`. Both go
through `mcp/tools.ts`, which is also where a tool call gets recorded onto the run's
progress stream (§5) and trace (§7).

**Transport, as built:** both servers are `McpServer` instances in this same process,
reached over the MCP SDK's `InMemoryTransport` linked pair (`mcp/client.ts`) — real
JSON-RPC tool-call/result traffic through a real MCP client, but no separate server
process to deploy or supervise. This is a deliberate consequence of §5's single-process
request architecture, and it's the honest framing of the MCP claim here: the protocol
boundary is real, the process boundary isn't.

**Why not fixtures, and why not fully arbitrary external services either.** Fixture data
proves the MCP *pattern* but not that MCP is doing anything real — a weak showcase for a
project whose explicit goal is to demonstrate genuine tool use. The alternative extreme —
wiring to arbitrary third-party SaaS APIs (a real analytics platform, a real docs
platform) — is a stronger showcase in principle but a real reliability risk for a public
demo link: an outage in a service you don't control makes "fully functional product" look
broken to a recruiter clicking it at the wrong moment. The resolution is real data you
still control: both servers ultimately depend on one external service (GitHub's API,
high-uptime, and something the Architecture Review sub-agent's other real integration
already commits to handling gracefully), rather than three independent third-party
dependencies each with their own failure schedule.

**Correction after implementation:** the "one external dependency" framing above was
slightly optimistic, and TDD 0004 made that visible. `docs-store` needs an *embeddings*
API — both to index the corpus and to embed each incoming query — and neither Anthropic
(the default `MODEL_PROVIDER`) nor Postgres provides one. So a running deployment
actually depends on two external APIs: GitHub, and whichever embeddings provider
`EMBEDDING_PROVIDER` selects (`google` by default, `openai` supported;
`mcp/docs-store/embeddings.ts` truncates either to the fixed 1536 dims `doc_chunks`
declares). The reasoning still holds — two high-uptime first-party model/platform APIs is
a very different risk profile from three independent SaaS integrations — but "one
external dependency" was the plan's claim, not the built system's, and is corrected here
rather than quietly left standing.

**Failure handling** follows the old project's discipline: an MCP call failure degrades
gracefully (the graph continues with an explicit "data unavailable" note) rather than
crashing the run or fabricating a plausible-looking substitute. As built, that's
`tryTool()` / `withDegradedNote()` in `lib/graph/nodes/shared.ts`: a failed tool call
becomes an entry in `state.errors` plus an explicit "[Note: … unavailable — continuing
without it.]" line in the affected deliverable, and the run still completes (and still
gets a trace row — §7).

---

## 4. Persistence: one Neon Postgres database, not several specialized services

**Decision: a single Neon Postgres database, with the `pgvector` extension, serving every
persistence need in this system.**

| Need | Table(s) | Code |
|---|---|---|
| LangGraph checkpointing (graph state/thread history) | created by `PostgresSaver.setup()` | `lib/db/checkpointer.ts` |
| `docs-store` vector search | `doc_chunks` (`vector(1536)` + ivfflat index) | `mcp/docs-store/searchDocs.ts` |
| Persistent memory (per-user/project facts) | `memory` | `lib/memory/store.ts` |
| GitHub-stats cache (TTL'd) | `github_stats_cache` | `mcp/analytics/getRepoStats.ts` |
| Rate-limit counters (§6) | `rate_limits` | `lib/rate-limit/check.ts` |
| Lightweight run traces (§7) | `run_traces` | `lib/tracing/record.ts` |

Schema lives in `migrations/*.sql`, applied by `scripts/migrate.ts` (which also calls the
checkpointer's own `setup()`).

**One honest exception in that table.** `memory` and its store shipped in TDD 0003 and are
tested, but nothing in the request path reads or writes them yet: the demo is single-shot
and anonymous, so there is no user or project identity to scope facts by
(`MemoryScope` needs a `userId`/`projectId` the product doesn't currently have). TDD 0010's
clarifying questions looked like they'd finally give it one — they don't: an answer belongs
to a run, not to a person, and hashed IPs (§6) are deliberately not an identity. So it
remains built infrastructure waiting on a product shape that doesn't exist yet, not a
currently-exercised capability — worth saying outright, since a persistence table listed
in an architecture doc reads as "in use" by default.

One database for all of this is a deliberate scope decision, not a shortcut: this is a
low-traffic public demo, and a dedicated vector DB or a separate Redis/session store
would be real infrastructure to provision and operate for a workload that doesn't need
it. Neon's free tier comfortably covers every table above. If this ever needed to scale
past a demo, splitting checkpointing/vectors/cache onto specialized services would be the
obvious next step — deliberately not taken here.

---

## 5. Request architecture: one synchronous streaming route, no background jobs

**Decision: a single Next.js app (no separate core package), with one synchronous
streaming Route Handler that runs the graph in-process per request.**

The old repo split a standalone agent library (`src/`) from a marketing site (`web/`)
because the agent wasn't reachable from the site at all. That split has no reason to
exist now: the graph *is* the backend of a real running product. It lives in
`app/api/generate/route.ts`, invoked directly by the page that renders its output,
sharing the same Neon connection and Vercel AI SDK provider config as the UI.

A visitor's request is handled entirely synchronously: the Route Handler runs the
LangGraph graph in-process (Node.js runtime, not Edge — the Postgres driver and MCP
servers need real Node APIs) and streams progress events (per-node start/complete/error,
MCP tool calls) to the browser as they happen, through the Vercel AI SDK's data-stream
protocol. There is no queue, no worker, no polling endpoint, and no run-ID-to-poll-later
indirection.

**As built** (TDD 0005): rather than consuming LangGraph's own event stream, the nodes are
instrumented to emit progress directly — `lib/graph/progress.ts` carries an emitter on an
`AsyncLocalStorage`, and `buildGraph()` wraps every node with it (the same mechanism §7's
tracing uses, on a second, independent store). The wire format is one `data-progress`
chunk per event (`lib/graph/streamProtocol.ts`), parsed on the client by
`lib/client/parseProgressStream.ts`. The final assembled result arrives as the last event
on that same stream, carrying the run ID §7's trace link needs.

**What synchronous streaming does *not* imply** (TDD 0012): that the output is gone when
the stream is. Through 0011 it was — the assembled result lived only in the page's React
state, so a refresh destroyed a run that took minutes to produce and 20% of the visitor's
hourly budget (§6) to buy, while `/trace/[runId]` went on serving that same run's metrics
indefinitely. The system durably remembered what a run cost and forgot what it produced.
That was an accident of sequencing rather than a decision, and 0012 closed it: a completed
run's deliverables are written to `run_results` (`lib/results/record.ts`) keyed by the same
`run_id`, and re-render at `/run/[runId]`. The write is best-effort on the same terms as
§7's trace write — a storage failure is logged, never turned into a failed run — and a leg
that paused for clarifying questions stores nothing, because it has no result yet.

**The one exception to "entirely synchronously"** (TDD 0010): a run that pauses for
clarifying questions is two requests, not one. The first ends its stream with a
`clarification-request` event instead of a `result`; the browser posts the answers back to
the *same* route as `{ runId, answers }`, and the second request resumes the checkpointed
thread with LangGraph's `Command({ resume })`. This is still not a background job — no
queue, no worker, no polling — because nothing runs between the two requests: the run is
parked in Postgres, waiting on a human, and the duration budget below applies per leg
rather than across the pause. What it does mean is that `run_traces` (§7) has to treat one
run as two legs, which is why `appendRunTrace` exists alongside `recordRunTrace`.

The resume deliberately does not consume a rate-limit unit (§6) — a paused run is one run.
That is safe because the route refuses to resume a thread that is not actually parked at an
interrupt, so a finished or unknown `runId` can't be replayed to buy another graph run.

**Deployment constraint this depends on:** Vercel's Hobby (free) tier defaults to a
60-second function duration, but with **Fluid Compute** (Vercel's current default
execution model, available on Hobby) that extends to **300 seconds**. This is workable
specifically *because* the graph in §1 is PRD → fan-out(3) → Roadmap rather than five
sequential sub-agents — the fully-sequential worst case (up to 15 LLM calls end-to-end)
would risk the ceiling; the parallelized shape gives real headroom. `maxDuration: 300` is
set explicitly on the route handler as a load-bearing part of this design, not an
incidental config value.

**Rejected alternative: background job + polling/subscription.** Rejected as
disproportionate infrastructure — a queue, a worker process, and run-state tracking are
worth it for a high-traffic or long-running production agent, but roughly double the
moving parts for a low-traffic demo that synchronous streaming already handles, given the
duration budget above.

---

## 6. Rate limiting: protecting free-tier resources, communicated honestly

**Decision: a simple IP-based rate limiter (e.g. 5 runs/hour/IP) backed by a table in the
same Neon database, with the limit surfaced proactively and gracefully — not silently
enforced.**

Every layer of this stack is on a free tier (Vercel Hobby, Neon free tier, GitHub API
rate limits). Per-run token cost is negligible, but *volume* is the real exposure: a
traffic spike (a recruiter's team sharing the link, a bot, a stress-test) could exhaust
Vercel's Hobby invocation/bandwidth caps or Neon's connection limits and take the whole
demo down, not just cost more. The limiter itself is a small table (`ip_hash`,
`window_start`, `count`) checked at the top of the Route Handler.

This is explicitly a UX requirement, not just a backend guard: the demo page states the
limit and the model in use up front (context for a technical visitor skimming the site),
and hitting the limit produces a clear, friendly message ("Demo rate limit reached — try
again in N minutes"), not a bare HTTP 429.

**As built** (TDD 0006): `checkRateLimit()` (`lib/rate-limit/check.ts`) runs before the
request body is even parsed in `app/api/generate/route.ts`; the limit is
`RATE_LIMIT_MAX_RUNS_PER_HOUR` (default 5) over hour-aligned windows. Visitor IPs are
never stored raw — `lib/rate-limit/hashIp.ts` hashes them with the required
`RATE_LIMIT_IP_SALT` first, which is why the table's key column is named `ip_hash`. The
429 response carries both the human-readable message and a `retry-after` header; the page
renders it as its own banner (`app/page.tsx`), distinct from the generic error state, and
the proactive up-front note is `app/RateLimitNote.tsx`.

---

## 7. Observability: a lightweight run trace, not the old full eval/rigor layer

**Decision: persist one trace row per graph run — nodes executed, per-node latency, token
usage, MCP calls made — exposed via a "view trace" link on the output. The old project's
full eval/rigor layer (golden-set regression harness, LLM-as-judge with bias checks, a
four-tag failure taxonomy) is explicitly deferred, not rebuilt for v1.**

The old rigor layer was one of the previous project's strongest ideas, but it needs
infrastructure disproportionate to a demo: a golden dataset, a judge-model pipeline, and
a regression-gate process meant to run on every code change. None of that is earned yet
by a system that doesn't have production traffic or a change-management process to gate.
A lightweight run trace gets most of the practical value (you can see what a run
actually did, how long each node took, what it cost) at a fraction of the build cost, and
is genuinely useful for debugging this project during its own build.

**As built** (TDD 0007): one `run_traces` row per run, keyed by the same `run_id` used as
the checkpointer's `thread_id`, with per-node latency, token counts, and MCP calls in a
`nodes` JSONB column plus a `total_cost_usd` total. Token counts are the AI SDK's own
reported `usage`, not an estimate; cost comes from a small hand-maintained pricing table
(`lib/tracing/pricing.ts`) rather than a pricing API, and falls back to $0 for an
unrecognized `MODEL_ID` instead of throwing. The "view trace" link on a completed run
points at `/trace/[runId]`. Two deliberate properties: a run that degraded (§3) still gets
a complete trace, and a failure to *write* the trace is logged but never turned into a
user-visible run failure.

TDD 0012 added a third per-run table beside these two, `run_results` (§5), and deliberately
did *not* give it the FK to `run_traces` that `run_evals` has. The eval harness controls
both of its rows and writes them in order, so an eval without a trace is a bug worth
rejecting. But a trace row is only written best-effort, so an FK on the results table would
let a transient failure writing *metrics* silently destroy the *deliverables* — backwards,
given which of the two a visitor waited five minutes for. The cost of that choice is that
deleting a trace can leave a result behind; the permalink renders fine without one.

The full eval/rigor concept was not dropped — it was named explicitly in §9 as deferred
work, with the reasoning stated, rather than silently disappearing the way it would if this
document just didn't mention it. TDD 0011 has since built it, as a manually-invoked
golden-set harness rather than as anything in the request path: the trace still records
what a run *did*, and a separate `run_evals` row (written only by the harness) records how
good a graded run's output was. §9 covers it.

---

## 8. Testing strategy

**Decision: the default test suite is fully mocked (Vercel AI SDK model calls and MCP
responses replaced with fixtures) and requires no API keys — a separate, manually-invoked
suite exercises the real Haiku 4.5 and real GitHub MCP integration.**

This preserves the old project's actual discipline (`npm test` needs no secrets, runs
fast, runs everywhere) for the bulk of the suite — graph routing/state logic, the PRD →
fan-out → Roadmap dependency edges, error/replan handling — none of which needs a live
model to verify. A second, small real-API suite (e.g. `npm run test:e2e`) is not part of
`npm test` and is not run automatically in CI: given the graph now makes genuinely real
calls, a suite that proves the real wiring works is still worth having, but managing
secrets and spend in CI for a demo project isn't a good trade against running it manually
before a deploy.

**As built** (TDD 0008): `npm test` is Vitest, needs no secrets, and runs alongside `npm
run typecheck` and `npm run lint` in `.github/workflows/ci.yml` on every push to `main`
and every PR. `npm run test:e2e` is four real-API scripts run in sequence —
`scripts/model-roundtrip.ts` (one real model call), `scripts/checkpoint-roundtrip.ts`
(real Postgres checkpointer, interrupt and resume), `scripts/clarification-roundtrip.ts`
(TDD 0010: a real triage call parks a run at `interrupt()`, a separately-constructed
checkpointer resumes it), `scripts/mcp-roundtrip.ts` (real `get_repo_stats` and
`search_docs`) — and is deliberately absent from the CI workflow.
TDD 0011 added a third mode alongside those two: `npm run eval`, the golden-set regression
harness (§9). It is manual for the same reason `test:e2e` is, only more so — it runs the
whole graph once per golden case plus five judge calls each, so it is a pre-deploy check
rather than a smoke test, and it is deliberately not part of `test:e2e` either.
The one thing none of the three covers is the streaming UX of a full real run end-to-end
through the route and page; that stays a manual `npm run dev` check, because asserting on
a ~300-second streaming run isn't practical to automate at this project's scale.

---

## 9. Human-in-the-loop and output evaluation: both deferred out of v1, both since built

Two capabilities were designed against, then deliberately scoped out of v1. Both have since
been built — clarifying questions by TDD 0010, the eval layer by TDD 0011 — and the record
below keeps the original reasoning alongside what shipped, since the scope cuts were the
decisions worth defending at the time.

### Clarifying questions (built — TDD 0010)

The original entry here predicted that adding LangGraph's `interrupt`/resume would be "an
incremental addition, not a redesign," because the checkpointed, resumable graph state it
needs was already being built for other reasons. That prediction held: the graph shape and
every node contract survived unchanged, and the work landed as one new node plus one
conditional edge.

**How it works as built.** `supervisor` (§1) makes one cheap triage call deciding whether
the request is specific enough to write a PRD from. If it isn't, it emits up to three
questions and the graph's one conditional edge routes to `clarificationGate`
(`lib/graph/nodes/clarificationGate.ts`), whose entire body is `interrupt()`. That throws,
LangGraph parks the run at a durable Postgres checkpoint keyed by the run's `thread_id`,
and the route ends the stream with a `clarification-request` event instead of a `result`
(§5). The browser renders the questions, posts the answers back to the same route against
that `runId`, and the resumed leg re-runs only the gate — `interrupt()` returns the answers
this time — before continuing into `prdAgent`, which folds them into its prompt. Every
other deliverable reads the PRD, so one node consuming the answers propagates them through
the whole graph.

**Two things that look like details and aren't.** The triage model call lives in
`supervisor`, not in the gate, because *a node that interrupts re-runs from the top when
resumed* — generating the questions inside the gate would pay for that call twice and could
return different questions than the ones the user just answered. And `GraphInterrupt` is
control flow, not failure: `withNodeProgress` has to recognize it and re-throw without
emitting a `node-status`/`error` event, or the progress log shows the visitor a red error
row at the exact moment the UI is asking them a question.

**What was deliberately not built with it.** This is one pause, not a conversation: there
is no second interrupt later in the graph, no follow-up on an answer, and no message
history. A node that hits ambiguity after the PRD exists still states its assumption and
keeps going, exactly as v1 did — and skipping the questions entirely is a first-class
button in the UI, not a failure to fill in a form, because proceeding on stated assumptions
was always a legitimate outcome. The `memory` table (§4) still has no identity to scope
facts by; the answers would have been a natural hook, but this demo has no auth and hashed
IPs are deliberately not an identity, so that stayed unbuilt rather than faked.

### Full eval/rigor layer (built — TDD 0011)

Golden-set regression testing, LLM-as-judge with bias checks, and the four-tag failure
taxonomy were deferred in favor of the lightweight run trace (§7), on the grounds that a
regression gate needs something to gate. The entry here predicted two attachment points —
the trace row's `run_id`, and the §8 test split as a third mode — and the build used both
without changing either decision's terms.

**How it works as built.** `npm run eval` (`scripts/eval.ts`) runs the real graph over the
three requests in `eval/golden/cases.json`, each as a normal traced run with its own
`run_id`, then grades each of the five deliverables in a *separate* judge call against a
four-dimension rubric (specificity, coherence, actionability, completeness, 1–5) and the
four-tag taxonomy (`unsupported-claim`, `missing-requirement`, `internal-contradiction`,
`generic-filler`). The judgment lands in a `run_evals` row keyed by that same `run_id`
(FK to `run_traces`), so a graded run shows a quality section at `/trace/[runId]` and
every other run says, in as many words, that it wasn't graded. The gate compares the suite
against a committed `eval/baseline.json` and exits non-zero on a regression, a score below
an absolute floor, an unmet deterministic check, or a missing deliverable.

**The bias check is a control document, not a promise.** "LLM-as-judge with bias checks"
is easy to claim and hard to mean. Here it is two fixed documents in
`eval/golden/controls.json` with known verdicts — a fluent PRD that says nothing, which
the judge must score at or below 3, and specific user stories tied to the request's stated
numbers, which it must score at or above 3.5. They are graded *first*, and a failure aborts
the run before it spends anything on graph runs: a judge that can't tell those two apart
produces scores nobody should act on, and the honest report is "the instrument is broken",
not a list of what look like product regressions. `JUDGE_PROVIDER`/`JUDGE_MODEL_ID` exist
so the judge can be a different — ideally stronger — model than the graph's deliberately
cheapest-available default (§2); the controls are what tell you whether the one you picked
is good enough.

**What was deliberately not built with it.** Visitor runs are not judged: five extra model
calls per run roughly doubles the spend on a demo whose cost argument is that it's cheap,
and adds latency inside the 300s ceiling (§5). The harness is not in CI — §8's reasoning
about secrets and spend applies more strongly to it than to `test:e2e`, so it stays a
pre-deploy command. And the golden set carries *expectations* (`mustMention` substrings
checked without a model, so the facts a request made unignorable aren't delegated to a
grader that can be talked out of them), not reference answers: scoring similarity to five
hand-written "correct" PRDs would measure conformity to one author's taste.

The demo page carries a short, plain-language version of where this leaves a visitor
(`app/WhatsNextNote.tsx`): the harness exists, but *your* run wasn't graded — someone who
just ran the demo shouldn't have to open this document to find that out.

---

## 10. Summary of rejected alternatives

| Decision point | Rejected | Why |
|---|---|---|
| Agent orchestration | Flat 5-way parallel fan-out | Incoherent output — sub-agents need the PRD to exist before their work is meaningful |
| Model calls | LangChain chat-model wrappers (`@langchain/anthropic`) | Two provider abstractions (backend + frontend) instead of one; Vercel AI SDK covers both |
| MCP data source | Fixture-only (as in the old project) | Proves the MCP pattern, not that MCP does anything real |
| MCP data source | Fully arbitrary third-party SaaS APIs | Stronger showcase in principle, but real outage risk for a public demo link |
| Persistence | Separate vector DB + separate session/KV store | Real infrastructure to operate for a workload that doesn't need it |
| Request handling | Background job + polling/subscription | Doubles the moving parts for a low-traffic demo that synchronous streaming already handles |
| Hosting | Vercel Pro | Free tier is workable given the parallelized graph shape and Fluid Compute's 300s ceiling |
| Observability | Full golden-set/LLM-as-judge eval layer for v1 | Disproportionate infrastructure without production traffic/change volume to gate — deferred to v2 and since built by TDD 0011 |
| Eval scope | Judging every visitor run inline | Roughly doubles model spend and adds latency inside the 300s ceiling, to grade runs nobody reads the grade of |
| Eval ground truth | Reference "correct" documents to score similarity against | Measures conformity to one author's taste; `mustMention` checks plus a rubric measure whether the output is usable |
| Conversation shape | Clarifying-question support (interrupt/resume) in v1 | Changed single-shot into multi-turn — real scope, deferred to v2 and since built by TDD 0010 |
| Clarification shape | A full chat loop (ask, answer, re-ask, refine) | One pause before the PRD covers the ambiguity that actually breaks a plan; a chat is a different product |
| Stored results | A foreign key to `run_traces`, as `run_evals` has | Traces are written best-effort, so an FK would let a failed metrics write destroy the deliverables (TDD 0012) |
| Stored results | A "my runs" listing page | Needs an identity to scope by, which this demo deliberately doesn't have — hashed IPs are not a user (§6) |
| Stored results | Auth on the run permalink | No auth exists to build on; the unguessable server-minted UUID is the capability, and the UI says so rather than implying privacy |

---

## 11. Implementation sequence

This document describes the target architecture. The actual build was sequenced as a
series of Technical Design Documents under [`docs/tdd/`](./docs/tdd), each scoped to be
implementable standalone, test-first, by a future session without re-deriving the
decisions above. All twelve have landed; each one's "as built" notes are folded into the
sections above. 0001-0008 built the system, 0009 reconciled these documents with it,
0010 and 0011 built the two capabilities 0009 had recorded as deferred, and 0012 fixed the
one gap none of them had noticed: a completed run's output didn't outlive its browser tab.

1. [`0001-app-scaffold-and-model-provider.md`](./docs/tdd/0001-app-scaffold-and-model-provider.md)
2. [`0002-langgraph-core.md`](./docs/tdd/0002-langgraph-core.md)
3. [`0003-neon-postgres-and-checkpointing.md`](./docs/tdd/0003-neon-postgres-and-checkpointing.md)
4. [`0004-mcp-servers.md`](./docs/tdd/0004-mcp-servers.md)
5. [`0005-streaming-route-and-ui.md`](./docs/tdd/0005-streaming-route-and-ui.md)
6. [`0006-rate-limiting.md`](./docs/tdd/0006-rate-limiting.md)
7. [`0007-run-tracing.md`](./docs/tdd/0007-run-tracing.md)
8. [`0008-ci-and-test-strategy.md`](./docs/tdd/0008-ci-and-test-strategy.md)
9. [`0009-future-work-docs.md`](./docs/tdd/0009-future-work-docs.md)
10. [`0010-clarifying-questions.md`](./docs/tdd/0010-clarifying-questions.md)
11. [`0011-eval-harness.md`](./docs/tdd/0011-eval-harness.md)
12. [`0012-durable-results.md`](./docs/tdd/0012-durable-results.md)

Queued, not yet built:

13. [`0013-production-hardening.md`](./docs/tdd/0013-production-hardening.md) —
    partially landed; the deployment-configuration gaps it documents are what
    made the demo return five empty panels in production.
14. [`0014-chat-style-ui.md`](./docs/tdd/0014-chat-style-ui.md) — the page
    becomes a conversational thread plus a workspace panel, matching the
    turn-taking interaction 0010 actually built.
15. [`0015-graph-traversal-view.md`](./docs/tdd/0015-graph-traversal-view.md) —
    draws the §1 graph as it executes, and retires `/trace/[runId]` into
    `/run/[runId]`. Ships with 0014 or not at all.
16. [`0016-domain-corpus.md`](./docs/tdd/0016-domain-corpus.md) — replaces the
    self-referential `search_docs` corpus with domain documents the example
    prompts can actually be grounded in.
17. [`0017-web-search-fallback.md`](./docs/tdd/0017-web-search-fallback.md) —
    a relevance floor (which is what makes "no grounding found" a state that
    can exist at all) plus a web-search fallback for when it isn't cleared.
