# TDD 0013 — Production hardening: making the deployed demo actually work

**Depends on:** 0001 (the provider/env layer this validates), 0004 (the MCP
servers whose two bugs this fixes), 0005 (the route this guards), 0006 (the
limiter whose config error crashed it), 0007/0012 (the `run_id` pages that
need a not-found state), 0008 (the CI workflow this extends).
**Unblocks:** the chat-UI redesign (0014) and the graph visualization (0015),
neither of which is worth building on top of a demo that renders five empty
panels.

## Context

Every TDD through 0012 was written about the system as a *codebase*. This one
is about the system as a *deployment*, because those turned out to be
different things, and nothing in the repo had noticed.

The trigger was a visitor-facing 500 on `POST /api/generate`. Chasing it
surfaced three separate failures stacked on top of each other, none of which
any test, type, or document would have caught:

1. **`RATE_LIMIT_IP_SALT` was never set in Vercel.** `hashIp()` requires it and
   throws when it's absent. Because `checkRateLimit` runs before anything else
   in the route (0006 put it there deliberately), *every* request died there,
   before parsing a body — as an unguarded throw, so Next returned a bare
   platform 500 with no JSON body at all.
2. **The production database had never been migrated.** `migrations/*.sql`
   existed and `scripts/migrate.ts` applied them, but nothing ran that script
   against production. `rate_limits` — and every other table — simply did not
   exist. The schema was version-controlled and unapplied, which is the
   failure mode a migrations directory is supposed to make impossible.
3. **`MODEL_PROVIDER` was never set either**, so `lib/models/provider.ts` fell
   back to its `anthropic` default against a deployment holding only a Google
   key. Every model call in the graph failed identically, and 0002's graceful
   degradation faithfully turned five failed nodes into five "unavailable"
   panels — a *correct* response to a *misconfigured* system, which is exactly
   why it stayed invisible for days.

The pattern is one thing, not three: **every configuration requirement in this
system is discovered at runtime, by the code that needs it, one request at a
time.** `.env.example` documents the vars, and 0001's provider layer throws a
clear message when one is missing — but "clear message" means clear in a
serverless log nobody reads, on a page that already rendered.

Two genuine code bugs surfaced in the same session, both invisible for the
same reason — the fixtures were better-behaved than production:

- **`get_repo_stats` failed on every cache hit.** `getRepoStats` returned
  `cached.fetched_at` straight from the driver, where `node-postgres` parses
  `TIMESTAMPTZ` into a `Date`, through an MCP output schema declaring
  `z.string()`. The fresh-fetch path stringifies and was fine, so the first
  call after each TTL expiry worked and the rest of the hour returned -32602.
  The test fixture typed `fetched_at` as `string` — truer to what the code
  *writes* than to what the database *returns*.
- **A blank query crashed the embeddings call.** `userStoryAgent` and
  `architectureReviewAgent` both search on the PRD's text. When the PRD
  degraded to empty (see #3 above), they embedded `""`, which every provider
  rejects — converting one node's *graceful* degradation into three more
  errors, each costing an API call to earn.

Both are fixed, test-first, as the opening move of this phase. They belong in
this TDD's record rather than a silent commit because they share its thesis:
the system was tested against a friendlier world than the one it runs in.

## Scope

**In scope:**

- **Startup env validation** (`lib/config/validate.ts`): one module that knows
  every required var, which are conditional on another's value
  (`ANTHROPIC_API_KEY` matters only when `MODEL_PROVIDER=anthropic`), and
  which have safe defaults. Called at the top of the route so a misconfigured
  deployment fails once, loudly, with every missing var named — not five times
  with one name each.
- **A health endpoint** (`app/api/health/route.ts`): reports env validity, DB
  reachability, whether `doc_chunks` is populated, and the resolved
  provider/model. No secrets in the response, no graph run, no rate-limit
  consumption. The thing that would have reduced this entire incident to one
  `curl`.
- **A route-level config guard**: `startRun`'s `checkRateLimit` call is the
  one path in `app/api/generate/route.ts` not wrapped in the error handling
  every other path has. It gets the same `jsonError` treatment, so a config
  failure is a JSON 500 the UI can render, never an opaque platform 500.
- **Error and not-found boundaries** (`app/error.tsx`, `app/not-found.tsx`):
  today a bad `/run/[runId]` UUID or any render throw shows Next's default
  page, styled like no other part of this app.
- **Doc indexing on deploy**: `doc_chunks` is populated only by manually
  running `scripts/index-docs.ts`. If it's empty in production, `search_docs`
  returns zero passages *silently* — no error, just ungrounded output — which
  makes §3's "real pgvector RAG over our own docs" the one architectural claim
  that can be false without anything failing. Indexing becomes part of
  deployment, skipping work when the corpus is unchanged so it doesn't spend
  embedding calls on every build.
- **`npm run build` in CI** (`.github/workflows/ci.yml`): typecheck, lint, and
  test all run, but nothing builds, so a build-breaking change reaches Vercel
  before anything catches it.
- **Documentation fidelity** (the 0009 discipline, applied to what this phase
  changes): `ARCHITECTURE.md` §2 defends Claude Haiku 4.5 as the default model
  at length; the deployment now runs `gemini-2.0-flash`, because the Google
  key is the one available at no cost and Anthropic has no free API tier. The
  *reasoning* in §2 (cheapest sufficient model, one env var, one call site)
  is unchanged and is in fact what made the switch a config change — but the
  document must say what runs.
- **A new `ARCHITECTURE.md` §12, "Operations"**: required vars per
  environment, how to provision a fresh deployment, and how to verify one.
  This incident is its motivation and belongs in it.

**Out of scope:**

- **Error tracking / structured logging** (Sentry or equivalent). Real gap —
  `console.error` is the whole story today, which is ironic for a system whose
  §7 is about observability — but it's a dependency and an account, and the
  health endpoint plus honest error boundaries cover the *demo* failure modes
  this phase is about. Named here so it's deferred rather than missed.
- **Any UI redesign.** 0014/0015 own that. The error/not-found boundaries here
  are deliberately plain, styled with existing tokens, and expected to be
  restyled by 0014.
- **Auth, multi-tenancy, or anything else §10 already rejected.**

## Acceptance criteria

- A deployment missing any required env var fails with one error naming all of
  them, at the route boundary, as a JSON response — not as five identical
  per-node failures and not as a bare platform 500.
- `GET /api/health` returns env/DB/corpus/model status, consumes no rate-limit
  unit, runs no graph, and leaks no secret values.
- `get_repo_stats` returns an ISO string on both the cache-hit and fresh
  paths, proven by a test whose fixture returns a `Date` the way the driver
  does. *(Landed.)*
- `searchDocs` returns no passages, and makes no embeddings call, for a blank
  query. *(Landed.)*
- A bad run ID renders this app's own not-found state; a render throw renders
  its own error state.
- A production deployment has a populated `doc_chunks`, and `search_docs`
  returning zero passages is distinguishable from an unindexed corpus.
- CI builds.
- `ARCHITECTURE.md` names the model that actually runs and carries a §12 that
  would have prevented this incident.

## Notes for the implementing session

- **The bar for the env validator is "one loud failure, every name".** The
  temptation is a generic `assertEnv()` helper; resist it. The conditional
  cases are the whole value — `ANTHROPIC_API_KEY` required only under one
  `MODEL_PROVIDER`, `GOOGLE_GENERATIVE_AI_API_KEY` required by *either* the
  model layer or the embeddings layer independently, `GITHUB_TOKEN` genuinely
  optional (unauthenticated GitHub is 60 req/hr, comfortably inside 0004's
  1-hour cache TTL).
- **The health endpoint is a demo artifact, not just an ops tool.** An
  interviewer clicking it sees the system's own account of whether it's
  correctly wired. Worth making its output readable rather than a bare `{ok:
  true}`.
- **Don't let indexing-on-deploy become a build-time embeddings bill.** Hash
  the corpus, store the hash, skip when unchanged. A deploy that changes only
  a component shouldn't re-embed every doc.
- **This phase is why the `vercel-build` hook now runs migrations** (that
  landed ahead of this document, while production was actively broken).
  Migration failure logs a warning and continues rather than blocking the
  build, on the grounds that a transient DB hiccup shouldn't take down an
  otherwise-good release — worth revisiting if it ever masks a real schema
  problem.
