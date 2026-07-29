# AI Product Engineer Copilot

A multi-step AI agent that generates PRDs, user stories, experiment designs,
architecture reviews, and roadmaps for PMs and founders. Built test-first as
a demonstration of production-grade agent design: typed tool-calling,
plan-then-execute orchestration, MCP integrations, persistent memory, and a
full eval/observability rigor layer.

Full design rationale — why plan-then-execute over ReAct, the memory model,
the MCP boundary, eval strategy, and rejected alternatives — is in
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

**This code is public for portfolio/demonstration purposes only — see
[`LICENSE`](./LICENSE). It is not open source and may not be copied, reused,
or redistributed.**

## Stack

TypeScript/Node, Anthropic API (Claude), Vitest, [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), Zod.

## Setup

```bash
npm install
```

```bash
npm test        # run the test suite (vitest)
npm run typecheck  # tsc --noEmit
npm run build   # compile to dist/
```

No environment variables or API keys are required to run the test suite —
every phase is tested against local, deterministic fixtures (mock MCP
servers, injected judge/planner models), per the reproducibility goals in
`ARCHITECTURE.md`.

## Phase overview

| Phase | What it covers | Status |
|---|---|---|
| 0 — Architecture doc | Agent loop design, memory model, MCP boundary, eval strategy, observability schema, rejected alternatives | ✅ [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| 1 — Typed tool-calling core | Tool registry with schema validation; malformed output rejected, not coerced; unknown tools fail loudly | ✅ [`src/tools/`](./src/tools) |
| 2 — Multi-step planning loop | Planner emits an ordered step list; executor replans around failures without running stale steps; max-step guard | ✅ [`src/planner/`](./src/planner) |
| 3 — MCP integrations (≥2 servers) | docs-store and analytics MCP servers; retrieved context used in output; cited (not invented) metrics; graceful degradation when unreachable | ✅ [`src/mcp/`](./src/mcp) |
| 4 — Persistent memory | Facts survive across sessions; scoped per user/project with no cross-leak; explicit invalidation | ✅ [`src/memory/`](./src/memory) |
| 5 — Rigor layer | Golden-set eval harness + regression runner, LLM-as-judge with sanity anchors and position/verbosity bias checks, 4-tag failure taxonomy, per-step observability traces | ✅ [`src/eval/`](./src/eval), [`src/observability/`](./src/observability) |
| 6 — Extraction for open source | Eval harness/judge/taxonomy → standalone Agent Evaluation Framework; MCP registry/routing/observability → MCP Toolkit | 🔜 Planned (Q4) |

Every phase above was built test-first: the failing tests were written
before the implementation, per the repo's own TDD discipline.
