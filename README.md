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

**All nine TDDs have landed — the system described in `ARCHITECTURE.md` is
built.** What that means concretely:

- A visitor types a free-text product description and gets five
  deliverables — PRD, user stories, architecture review, experiment design,
  roadmap — from a real LangGraph graph (`lib/graph/`) shaped
  `supervisor → prdAgent → [userStory, architectureReview, experimentDesign]
  → roadmap → assembler`, with per-node progress streaming to the browser as
  it runs (`app/api/generate/route.ts`, `app/page.tsx`).
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
  a real Postgres checkpointer, and the real MCP tools manually.

Honest edges, documented rather than glossed: the `memory` table shipped but
nothing in the request path uses it yet (there's no user identity in a
single-shot demo); the graph can't stop to ask a clarifying question; and
nothing automatically scores output quality. `ARCHITECTURE.md` §9 covers the
last two — why they were cut from v1 and what adding them would touch — and
the demo page says so in plain language too.

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

## Setup

```
npm install
cp .env.example .env.local   # model API key, DATABASE_URL, RATE_LIMIT_IP_SALT
npx tsx scripts/migrate.ts   # applies migrations/*.sql and checkpointer.setup()
npx tsx scripts/index-docs.ts  # optional: builds docs-store's corpus
npm run dev
```

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
3. `scripts/mcp-roundtrip.ts` — calls the real `get_repo_stats` and
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
