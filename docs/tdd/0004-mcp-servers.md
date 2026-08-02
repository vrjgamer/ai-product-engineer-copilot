# TDD 0004 — MCP Servers

**Depends on:** 0002 (graph nodes to wire tools into), 0003 (`pgvector`
extension, DB connection, migration tooling).
**Unblocks:** 0005 (the wired-up graph the route handler runs).

## Context

`ARCHITECTURE.md` §3 establishes two MCP servers, both backed by real data
rather than fixtures, both ultimately depending on one external service
(GitHub's API) so there's a single failure surface to handle gracefully.
This phase builds both servers and wires them into the relevant sub-agent
nodes from 0002.

## Scope

**In scope:**

**`docs-store` MCP server:**
- A real MCP server (using `@modelcontextprotocol/sdk`, matching the old
  project's choice) exposing a `search_docs` tool: embedding-based
  similarity search (`pgvector`) over an indexed corpus of real markdown
  docs.
- An indexing script that chunks and embeds a chosen real doc corpus (e.g.
  this repo's own docs, or another real public repo's docs) into the
  `pgvector` table. **Embedding-model note**: Anthropic does not offer an
  embeddings API — the indexing script and the `search_docs` tool's
  query-embedding step need an embeddings-capable provider (e.g. OpenAI's
  `text-embedding-3-small` via `@ai-sdk/openai`, or Google's embedding
  model via `@ai-sdk/google`). This is independent of the *generation*
  model choice from 0001 (Haiku 4.5) — document this clearly so it isn't
  mistaken for an inconsistency with the "provider-agnostic" decision; it's
  a different capability (embeddings vs. generation), not a different
  policy.
- Returned passages carry a `[source:<id>]`-style citation tag, same
  anti-hallucination discipline as the old project.

**`analytics` MCP server:**
- A real MCP server exposing a `get_repo_stats` tool: fetches real GitHub
  repository statistics (stars, open issues, commit velocity, recent PR
  merge rate) via the GitHub REST API for a configured demo repository.
- A TTL'd cache table (e.g. `github_stats_cache`, keyed by repo + fetched
  timestamp) so repeated demo runs don't hit GitHub's API on every request.

**Wiring:** `docs-store` is called from `prdAgent`, `userStoryAgent`, and
`architectureReviewAgent`. `analytics` is called from
`architectureReviewAgent` and `roadmapAgent`. This is additive to 0002's
node implementations — the graph's shape and state contract from 0002 do
not change; nodes just gain a tool call before producing their output.

**Graceful degradation**: an MCP call failure (server unreachable, GitHub
API error/rate-limited, timeout) must not crash the node — the node
continues with an explicit "data unavailable" note appended to its output
and an entry in `state.errors`, matching 0002's error-handling contract and
the old project's MCP failure discipline (`ARCHITECTURE.md` §3).

**Out of scope (later TDDs):**
- The streaming route handler that invokes the graph (0005).
- Rate limiting of the demo's *own* traffic (0006) — this phase's caching is
  about protecting GitHub's API budget, not the demo's own abuse surface.

## Interfaces

```ts
// mcp/docs-store/server.ts
// Exposes tool: search_docs({ query: string }) -> { passages: CitedPassage[] }

// mcp/analytics/server.ts
// Exposes tool: get_repo_stats({ repo: string }) -> RepoStats
// Internally: check github_stats_cache table (TTL) before calling GitHub API.
```

## Acceptance criteria (test-first)

- A mocked unit test for `search_docs` asserts returned passages include a
  `[source:<id>]` tag traceable to a specific indexed document (fixture
  embeddings/corpus for this test — no real embedding calls in the default
  suite).
- A mocked unit test for `get_repo_stats` asserts a cache hit (fixture cache
  row within TTL) returns cached data without calling the GitHub API mock;
  a cache miss/expired entry does call it.
- A mocked unit test asserts that when `search_docs` or `get_repo_stats`
  throws (simulated failure), the calling graph node (from 0002) completes
  with a degraded output and an `errors` entry, rather than the whole graph
  run failing.
- A **manual/real-API-suite test**: with real `DATABASE_URL` and a real
  GitHub token, run `get_repo_stats` against the actual configured demo
  repo and assert real data comes back in the expected shape. Same for a
  real, small indexed corpus and `search_docs`.

## Notes for the implementing session

- The specific doc corpus and demo GitHub repo are content/config decisions
  for the implementing session to make (e.g. this repo itself, once
  rebuilt, is a reasonable `docs-store` corpus and `analytics` target) — not
  something this TDD needs to pin down further.
- Keep the embeddings-provider dependency isolated to the `docs-store`
  indexing/query code — don't let it leak into the generation-model
  provider abstraction from 0001.
