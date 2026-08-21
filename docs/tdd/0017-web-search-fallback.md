# TDD 0017 — Web search as a grounding fallback, and a relevance floor

**Depends on:** 0004 (the MCP client/tool layer this extends), 0016 (a corpus
worth measuring distance against), 0013 (env validation, which a new
API-keyed dependency needs).
**Unblocks:** nothing queued.

## Context

The request behind this phase is "search the web when no files are
available." Building it turns out to require answering a prior question this
system has never answered: **what does "no files are available" mean here?**

Today, nothing. `searchDocs` is `ORDER BY embedding <=> $1 LIMIT 5` with no
`WHERE` clause. It returns the five nearest chunks unconditionally — there is
no distance at which it returns fewer, and no distance at which it returns
none. `formatDocsContext` then labels whatever came back "Relevant docs:".
Retrieval always succeeds, so a fallback triggered by retrieval *failing*
would never fire.

So this phase is two things that only make sense together:

1. **A relevance floor**, which creates the "no useful grounding" state.
2. **A web search tool**, which is what to do when the system is in it.

The order matters. A web-search tool added without the floor would either
never run (if gated on the empty result that can't happen) or always run
(if ungated), and "always" is the expensive, rate-limited, externally-
dependent option running on every node of every request.

## Scope

**In scope:**

- **A distance floor in `searchDocs`.** Select the cosine distance alongside
  each row and drop anything beyond a configured maximum
  (`DOCS_MAX_COSINE_DISTANCE`, injectable for tests). Passages become a
  filtered set that *can* be empty — which is the state the rest of this TDD
  is about.
- **Honest context labelling.** `formatDocsContext` stops asserting
  relevance it hasn't established. Retrieved-and-above-floor passages keep a
  relevance claim; nothing retrieved produces no header rather than an empty
  promise.
- **A `search_web` MCP tool**, in a third MCP server (`mcp/web-search/`),
  wrapping one search API. Returns a small number of results as cited
  passages — title, URL, snippet — in the same `[source:<url>]` shape
  `search_docs` returns, so downstream formatting and the anti-hallucination
  citation discipline are unchanged.
- **A `gatherContext` helper** in `lib/graph/nodes/shared.ts`: try
  `search_docs`; if the result cleared the floor, use it; otherwise try
  `search_web`; if that fails or is unconfigured, degrade with an explicit
  note exactly as `tryTool`/`withDegradedNote` already do. **The policy lives
  here, not in either tool** — `search_docs` and `search_web` stay
  single-purpose and independently testable, and one call site decides when
  the web is worth reaching for.
- **A TTL cache for web results**, `web_search_cache`, mirroring
  `github_stats_cache` (0004) — same reasoning, and now with the
  `TIMESTAMPTZ`-returns-a-`Date` lesson from 0013 applied on the way out.
- **Env validation and graceful absence.** No API key configured means
  `search_web` is *absent*, not broken: `gatherContext` skips it and degrades
  with a note. The demo must run correctly on a deployment that has no search
  key at all, exactly as it runs today.

**Out of scope:**

- **Fetching and reading result pages.** Snippets only. Full-page fetch is a
  crawler, a content-extraction problem, and a much larger latency budget
  inside the 300s ceiling (§5).
- **Replacing `search_docs`.** The corpus stays primary; the web is the
  fallback. A system that always searches the web has no use for 0016.
- **Web search for the repo-introspection case.** A question about this
  system is answered by the repo's own indexed docs, which will clear the
  floor comfortably.

## The dependency this adds, and why §3's argument survives it

ARCHITECTURE §3 argued explicitly against "fully arbitrary third-party SaaS
APIs" because an outage in a service you don't control makes a public demo
look broken to someone clicking it at the wrong moment. §3 was then corrected
once already, when 0004 revealed the embeddings dependency the plan hadn't
counted. Adding a search API is a *third* external dependency and deserves
that argument applied rather than waved past.

It survives on one condition, which is a scope requirement, not a hope: **the
fallback must be strictly optional at runtime.** `search_docs` clearing the
floor is the common path for every example prompt (0016 built the corpus to
make sure of it). The web is reached for only when grounding is genuinely
thin, and its failure — outage, quota, missing key — is a degraded note, the
same as any other failed tool since 0004. Nothing about the demo's headline
path depends on it.

That is a different risk profile from the SaaS integrations §3 rejected,
where the integration *was* the feature. Here it's the branch taken when the
first choice found nothing.

**Provider choice is deferred to the implementing session**, with the
constraint that it must have a free tier sufficient for demo traffic under
the 0006 rate limit and a TTL cache. Google's Programmable Search JSON API
(100 queries/day free) is the most literal reading of the request; Brave and
Tavily are the alternatives worth pricing, Tavily notably returning
LLM-shaped snippets rather than SERP HTML. Whichever is chosen, it goes
behind the MCP tool boundary, so swapping it later is one file.

## Acceptance criteria

- `searchDocs` returns no passages when nothing clears the distance floor,
  proven by a test with a fixture at a known distance on each side of it.
- `formatDocsContext` never labels passages relevant when none cleared the
  floor.
- `gatherContext` prefers docs, falls back to web only when docs are thin,
  and degrades with an explicit note when neither is available — three
  tests, no live API calls.
- A deployment with no search API key configured behaves exactly as today.
- Web results are cited with their URL, cached with a TTL, and returned as
  ISO strings (the 0013 lesson).
- `npm run test:e2e` gains a real `search_web` round trip, consistent with
  the 0008 split.

## Notes for the implementing session

- **The floor value is empirical and worth tuning against the real corpus.**
  Pick it by embedding each of 0016's four example prompts plus two
  deliberately off-domain queries, printing actual distances, and choosing a
  number with daylight on both sides. Do not guess a value from intuition
  about cosine distance — record the measured numbers in a comment, because
  the next person to touch it will need the same evidence.
- **Watch for the floor making the demo *worse* before 0016 lands.** Against
  today's repo-only corpus, a correct floor rejects almost every product
  query, and every node degrades. That is the honest result, and it is why
  these two TDDs are ordered — do not soften the floor to compensate for a
  corpus that 0016 is fixing.
- **`gatherContext` is the natural place for a future third source** (the
  `memory` table, if the product ever grows the identity §4 says it lacks).
  Shape it as "ordered strategies, first sufficient one wins" rather than a
  hardcoded if/else pair.
- **Cache key on the query string, not the node.** Three nodes searching the
  same PRD text should cost one upstream call.
