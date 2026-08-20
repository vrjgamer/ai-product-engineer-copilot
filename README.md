# AI Product Engineer Copilot

A multi-agent graph that generates PRDs, user stories, experiment designs,
architecture reviews, and roadmaps for PMs and founders — orchestrated with
LangGraph, calling models through a provider-agnostic layer, and using real
MCP tool calls against real (self-controlled) data sources.

**This is the rebuild.** The previous implementation (a hand-rolled
planner/executor loop with fixture-only tests and a scripted/fake "live
demo") has been replaced with a genuinely functional product: a real
LangGraph state graph, a real (cheap) model actually being called, real MCP
tool use, and a demo that runs the real thing. The product concept is
unchanged — only the engineering underneath it was rebuilt from scratch.

**Evaluating this project as a portfolio piece?** Start with
[`VISION.md`](./VISION.md) — it's written for a recruiter/hiring-manager
audience and explains what to look for as evidence of engineering judgment,
not just tool familiarity.

Full technical design rationale for the rebuild — the supervisor/sub-agent
graph shape, the model provider layer, the MCP boundary, persistence,
deployment constraints, and what's deliberately deferred — is in
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

**This code is public for portfolio/demonstration purposes only — see
[`LICENSE`](./LICENSE). It is not open source and may not be copied, reused,
or redistributed.**

## Stack

TypeScript, Next.js (single app — UI and backend together), LangGraph.js
(`@langchain/langgraph`), the Vercel AI SDK (`ai` + `@ai-sdk/anthropic` /
`@ai-sdk/openai` / `@ai-sdk/google`) for provider-agnostic model calls, the
MCP TypeScript SDK, Neon Postgres (`pgvector`) for all persistence, deployed
on Vercel's free tier with Fluid Compute.

Default model: Claude Haiku 4.5 — chosen deliberately as the cheapest current
Claude model, since this is a public demo rather than a system optimizing for
output quality. See `ARCHITECTURE.md` §2 for the reasoning and cost estimate.

## Current status

**All twelve TDDs have landed — the system described in `ARCHITECTURE.md` is
built.** What that means concretely:

- A visitor types a free-text product description and gets five
  deliverables — PRD, user stories, architecture review, experiment design,
  roadmap — from a real LangGraph graph (`lib/graph/`) shaped
  `supervisor → prdAgent → [userStory, architectureReview, experimentDesign]
  → roadmap → assembler`, with per-node progress streaming to the browser as
  it runs (`app/api/generate/route.ts`, `app/page.tsx`).
- If the description is too vague to plan against, the supervisor routes to a
  `clarificationGate` node that pauses the run at a durable checkpoint, asks
  up to three questions, and continues with the answers folded into the PRD
  (TDD 0010). Answering is optional — skipping runs it on stated assumptions.
- Model calls go through one provider seam (`lib/models/provider.ts`,
  `MODEL_PROVIDER`/`MODEL_ID`), defaulting to Claude Haiku 4.5.
- Two MCP servers do real work: `docs-store` runs pgvector search over this
  repo's own indexed docs, `analytics` pulls real GitHub repo stats with a
  TTL cache. Both are real MCP JSON-RPC over an in-process transport, and an
  MCP failure degrades the run's output rather than crashing it.
- One Neon Postgres database backs checkpointing, embeddings, the stats
  cache, rate limits, and traces (`migrations/`).
- Runs are rate-limited (5/hour/IP by default, IPs hashed, never stored raw),
  and every completed run links to a trace view at `/trace/[runId]` with
  per-node latency, real token counts, MCP calls, and computed cost.
- `npm test` (fully mocked, no secrets) plus typecheck and lint run in CI on
  every push and PR; a separate `npm run test:e2e` exercises the real model,
  a real Postgres checkpointer, a real interrupt/resume round-trip, and the
  real MCP tools manually.
- A completed run is saved and gets a shareable permalink at `/run/[runId]`
  (TDD 0012), so closing the tab no longer destroys a plan that took minutes
  and a fifth of an hourly rate-limit budget to produce.
- `npm run eval` is the golden-set regression harness (TDD 0011): it runs the
  real graph over `eval/golden/cases.json`, has a second model grade each
  deliverable against a rubric and a four-tag failure taxonomy, checks its
  own judge against control documents with known verdicts before believing a
  single score, and fails on a regression against a committed baseline.

Honest edges, documented rather than glossed: the `memory` table shipped but
nothing in the request path uses it yet (there's still no user identity — an
answer to a clarifying question belongs to a run, not to a person); the
clarification pause is one question round, not a conversation; and quality
scoring is a harness you run by hand against fixed cases, not something that
grades live traffic — judging every visitor run would roughly double what the
demo costs to operate. `ARCHITECTURE.md` §9 covers that trade, and the demo
page says it in plain language too. Saved runs (TDD 0012) add two more: the
permalink's only access control is the unguessability of its server-minted
UUID — anyone with the link can read the run, which is why the UI calls it a
share link rather than implying privacy — and stored runs currently have no
expiry, so a real deployment would want a retention policy this demo doesn't
have. That table is also the first one holding visitor-typed text.

## Implementation sequence (TDDs)

Each document is scoped to be implementable standalone by a future session,
without needing to re-derive the decisions in `ARCHITECTURE.md`.

| # | TDD | Covers |
|---|---|---|
| 1 | [`0001-app-scaffold-and-model-provider.md`](./docs/tdd/0001-app-scaffold-and-model-provider.md) | Next.js app scaffold, Vercel AI SDK provider abstraction, a mocked-tested Haiku round-trip |
| 2 | [`0002-langgraph-core.md`](./docs/tdd/0002-langgraph-core.md) | The graph itself: Supervisor → PRD → fan-out(User Story, Architecture Review, Experiment Design) → Roadmap → Assembler, fully mocked |
| 3 | [`0003-neon-postgres-and-checkpointing.md`](./docs/tdd/0003-neon-postgres-and-checkpointing.md) | Neon Postgres provisioning, LangGraph checkpointing, persistent memory tables |
| 4 | [`0004-mcp-servers.md`](./docs/tdd/0004-mcp-servers.md) | `docs-store` (pgvector search over real docs) and `analytics` (real GitHub stats, cached) MCP servers |
| 5 | [`0005-streaming-route-and-ui.md`](./docs/tdd/0005-streaming-route-and-ui.md) | The streaming Route Handler and the live demo UI |
| 6 | [`0006-rate-limiting.md`](./docs/tdd/0006-rate-limiting.md) | IP-based rate limiting with proactive/graceful UX messaging |
| 7 | [`0007-run-tracing.md`](./docs/tdd/0007-run-tracing.md) | Lightweight per-run observability trace |
| 8 | [`0008-ci-and-test-strategy.md`](./docs/tdd/0008-ci-and-test-strategy.md) | CI workflow, mocked-vs-real-API test suite split |
| 9 | [`0009-future-work-docs.md`](./docs/tdd/0009-future-work-docs.md) | Docs reconciled against the shipped system; visitor-facing note on what's deliberately deferred |
| 10 | [`0010-clarifying-questions.md`](./docs/tdd/0010-clarifying-questions.md) | Human-in-the-loop: the supervisor triages vague requests, the graph pauses at `interrupt()`, the route resumes it with the answers |
| 11 | [`0011-eval-harness.md`](./docs/tdd/0011-eval-harness.md) | Golden-set eval harness: calibrated LLM-as-judge, four-tag failure taxonomy, deterministic checks, regression gate |
| 12 | [`0012-durable-results.md`](./docs/tdd/0012-durable-results.md) | Completed runs persisted to `run_results` and served at a shareable `/run/[runId]` permalink, so output outlives the tab |

## Setup

```
npm install
cp .env.example .env.local   # model API key, DATABASE_URL, RATE_LIMIT_IP_SALT
npx tsx scripts/migrate.ts   # applies migrations/*.sql and checkpointer.setup()
npx tsx scripts/index-docs.ts  # optional: builds docs-store's corpus
npm run dev
```

A deployment needs the same three things a local checkout does: the model
API key, `DATABASE_URL`, and `RATE_LIMIT_IP_SALT` set in the hosting
project's environment, plus `scripts/migrate.ts` having been run **against
that deployment's database** — the `rate_limits` table is read on every
`POST /api/generate` before the graph is touched. Miss any of them and the
route answers `503` with a "can't reach its database" message instead of
starting a run; the underlying error (missing variable, missing table,
unreachable host) is in the server logs.

`RATE_LIMIT_IP_SALT` is required — visitor IPs are hashed with it before
they're written to the `rate_limits` table, and are never stored raw. The
indexing step is optional but recommended: without it `search_docs` returns
nothing, so the PRD, user-story, and architecture-review agents run without
cited context (and degrade with an explicit "unavailable" note if the
embeddings call itself fails). It needs an embeddings key
(`EMBEDDING_PROVIDER`, defaults to `google`) separate from the model key —
see `ARCHITECTURE.md` §3.

`npm test` runs the fully-mocked suite (no API keys/DB needed) and is what
CI (`.github/workflows/ci.yml`) runs on every push/PR, alongside `npm run
typecheck` and `npm run lint`. See `ARCHITECTURE.md` §8 for the rationale
behind keeping the suite below manual-only and out of CI.

`npm run test:e2e` is that separate, manually-invoked suite — it is **not**
run in CI. It calls the real model provider, a real Postgres checkpointer,
and the real MCP servers, in order:

1. `scripts/model-roundtrip.ts` — one real `generateText` call through the
   configured model provider (TDD 0001).
2. `scripts/checkpoint-roundtrip.ts` — interrupts and resumes the real
   LangGraph graph against a real Postgres checkpointer, asserting the
   resumed run continues from the saved state instead of restarting (TDD
   0003).
3. `scripts/clarification-roundtrip.ts` — sends a deliberately vague request
   so the real triage model parks the run at `interrupt()`, then resumes it
   through a separately-constructed checkpointer and asserts the answer
   reached the PRD (TDD 0010).
4. `scripts/mcp-roundtrip.ts` — calls the real `get_repo_stats` and
   `search_docs` MCP tools against real GitHub data and a real indexed
   corpus (TDD 0004).

Run it with:

```
DATABASE_URL=postgres://... npx tsx scripts/migrate.ts
DATABASE_URL=postgres://... ANTHROPIC_API_KEY=sk-... GOOGLE_GENERATIVE_AI_API_KEY=... GITHUB_TOKEN=ghp_... npm run test:e2e
```

(`GITHUB_TOKEN` is optional but recommended for `get_repo_stats` — see
`.env.example`. `scripts/index-docs.ts` must have been run against
`DATABASE_URL` beforehand so `search_docs` has a corpus to query.) A full
real end-to-end run through the actual streaming route and UI (TDD 0005) is
verified manually via `npm run dev` — it isn't automated, since asserting
streaming UX over a real ~300s run isn't practical in a script.

`npm run eval` is the third mode (TDD 0011) — also manual, also absent from
CI, and more expensive than either of the others: it runs the whole graph
once per golden case, then makes five judge calls per run.

```
DATABASE_URL=postgres://... ANTHROPIC_API_KEY=sk-... npm run eval
npm run eval -- --update-baseline    # snapshot a passing suite as the new baseline
```

It grades the two control documents in `eval/golden/controls.json` first and
aborts if the judge can't tell them apart — a lenient or severe judge makes
every score below it meaningless, so that's reported as a broken instrument
rather than as a product regression. Then each case in
`eval/golden/cases.json` runs as a normal traced run (inspectable at
`/trace/<runId>`, with a quality section the visitor-facing runs don't have),
is checked against model-free `mustMention` expectations, and is scored 1–5
on four rubric dimensions with any of four failure tags attached. The gate
exits non-zero on a regression against `eval/baseline.json`, a score below
the absolute floor, an unmet expectation, or a missing deliverable.
`eval/baseline.json` is not committed here — it can only be produced by a
real run, so record one with `--update-baseline` and commit it; until then
the gate enforces the floor and says the baseline is missing. Set
`JUDGE_PROVIDER`/`JUDGE_MODEL_ID` to grade with a different (ideally
stronger) model than the graph runs on.
