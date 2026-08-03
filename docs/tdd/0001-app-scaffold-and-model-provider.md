# TDD 0001 — App Scaffold and Model Provider

**Depends on:** nothing (first implementation phase).
**Unblocks:** 0002 (graph nodes need a model provider to call).

## Context

This is the foundation everything else builds on: a single Next.js app
(replacing the old `src/` package and `web/` site — see `ARCHITECTURE.md`
§5), and a provider-agnostic model-calling layer (`ARCHITECTURE.md` §2) that
every later sub-agent node will use. Nothing in this phase is graph logic —
it's the scaffold and the one cross-cutting abstraction the rest of the
project depends on.

## Scope

**In scope:**
- Initialize a Next.js (App Router) TypeScript project at the repo root.
- Add `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` as
  dependencies.
- A model-provider module (e.g. `lib/models/provider.ts`) exposing a single
  function — e.g. `getModel(): LanguageModel` — that resolves provider and
  model ID from environment variables (`MODEL_PROVIDER` ∈
  `anthropic | openai | google`, `MODEL_ID`, defaulting to
  `MODEL_PROVIDER=anthropic`, `MODEL_ID=claude-haiku-4-5`) and returns the
  corresponding Vercel AI SDK model instance. This is the *only* place in
  the codebase that imports a `@ai-sdk/*` package directly — every graph
  node calls `getModel()`, never a provider package.
- A trivial round-trip proving the wiring actually works: a minimal script
  or temporary API route that calls `generateText({ model: getModel(),
  prompt: "..." })` against the real default model, run manually (not part
  of the mocked CI suite — this is a one-time wiring proof, documented in
  the TDD's acceptance criteria, not a permanent test).
- `npm run typecheck`, `npm run lint`, `npm test` scripts wired up (Vitest,
  matching the old project's tooling choice — no reason to change it).
- `.env.example` documenting `MODEL_PROVIDER`, `MODEL_ID`, and the
  corresponding API key env var(s) (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` /
  `GOOGLE_GENERATIVE_AI_API_KEY`).

**Out of scope (later TDDs):**
- Any graph/LangGraph code (0002).
- Any database/Postgres code (0003).
- Any MCP server code (0004).
- Real UI beyond a placeholder page — the actual demo UI is 0005.

## Interfaces

```ts
// lib/models/provider.ts
import type { LanguageModel } from "ai";

export function getModel(): LanguageModel;
// Resolves MODEL_PROVIDER + MODEL_ID from process.env.
// Throws a clear error if MODEL_PROVIDER is set to an unsupported value,
// or if the corresponding API key env var is missing.
```

## Acceptance criteria (test-first)

- A mocked unit test asserts `getModel()` returns an Anthropic model
  instance when `MODEL_PROVIDER=anthropic` (default), an OpenAI instance
  when set to `openai`, and a Google instance when set to `google` — mock
  the `@ai-sdk/*` provider constructors, don't make real network calls in
  this test.
- A mocked unit test asserts `getModel()` throws a descriptive error for an
  unrecognized `MODEL_PROVIDER` value.
- A mocked unit test asserts the default (`MODEL_PROVIDER` unset) resolves
  to `claude-haiku-4-5` via Anthropic.
- `npm run typecheck` and `npm run lint` pass on a clean checkout.
- Manual verification (not a CI test): with a real `ANTHROPIC_API_KEY` set,
  the trivial round-trip script successfully calls Haiku 4.5 and prints a
  response — proving the provider wiring works end-to-end before any graph
  logic depends on it.

## Notes for the implementing session

- Don't scaffold graph, MCP, or database code even if it's tempting to get
  ahead — keep this phase strictly to the app skeleton and the provider
  abstraction, so it's independently reviewable and so 0002 has a stable,
  tested foundation to build on.
- The old `src/` and `web/` directories should be removed as part of this
  phase, since the new Next.js app scaffold replaces both.
