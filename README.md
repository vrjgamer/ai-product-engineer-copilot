# AI Product Engineer Copilot

A multi-agent graph that generates PRDs, user stories, experiment designs,
architecture reviews, and roadmaps for PMs and founders — orchestrated with
LangGraph, calling models through a provider-agnostic layer, and using real
MCP tool calls against real (self-controlled) data sources.

**This project is being rebuilt.** The previous implementation (a hand-rolled
planner/executor loop with fixture-only tests and a scripted/fake "live
demo") is being replaced with a genuinely functional product: a real
LangGraph state graph, a real (cheap) model actually being called, real MCP
tool use, and a real deployed demo a visitor can run. The product concept is
unchanged — only the engineering underneath it is being rebuilt from scratch.

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

## Stack (rebuild)

TypeScript, Next.js (single app — UI and backend together), LangGraph.js
(`@langchain/langgraph`), the Vercel AI SDK (`ai` + `@ai-sdk/anthropic` /
`@ai-sdk/openai` / `@ai-sdk/google`) for provider-agnostic model calls, the
MCP TypeScript SDK, Neon Postgres (`pgvector`) for all persistence, deployed
on Vercel's free tier with Fluid Compute.

Default model: Claude Haiku 4.5 — chosen deliberately as the cheapest current
Claude model, since this is a public demo rather than a system optimizing for
output quality. See `ARCHITECTURE.md` §2 for the reasoning and cost estimate.

## Current status

The rebuild is underway: `ARCHITECTURE.md` and the Technical Design
Documents under [`docs/tdd/`](./docs/tdd) describe the full target system.
Implementation proceeds one TDD at a time, test-first, in the order below.
TDD 0001 (app scaffold, model provider), TDD 0002 (LangGraph core), TDD 0003
(Neon Postgres, checkpointing, persistent memory), TDD 0004 (`docs-store` and
`analytics` MCP servers), and TDD 0005 (the streaming route handler and the
live demo UI) have landed — the old `src/` and `web/` directories from the
previous implementation have been removed. The app is reachable end-to-end
(`npm run dev`, free-text input → streamed progress → the five deliverables)
as of TDD 0005; it isn't yet rate-limited (0006) or trace-linked (0007).

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
| 9 | [`0009-future-work-docs.md`](./docs/tdd/0009-future-work-docs.md) | Recruiter-facing write-up of deliberately deferred features |

## Setup

```
npm install
cp .env.example .env.local   # fill in a model API key and DATABASE_URL
npx tsx scripts/migrate.ts   # applies migrations/*.sql and checkpointer.setup()
npm run dev
```

`npm test` runs the fully-mocked suite (no API keys/DB needed). See
`ARCHITECTURE.md` §8 for the (separate, manually-invoked) real-API suite.
