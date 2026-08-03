# TDD 0003 — Neon Postgres and Checkpointing

**Depends on:** 0002 (the graph being checkpointed must exist).
**Unblocks:** 0004 (pgvector table for `docs-store`, cache table for
`analytics`), 0006 (rate-limit table), 0007 (run-trace table) — all reuse
the connection/migration setup from this phase.

## Context

`ARCHITECTURE.md` §4 establishes one Neon Postgres database serving every
persistence need in this system, rather than separate specialized services.
This phase sets up that database and wires the first two consumers: LangGraph
checkpointing (so a graph run's state survives the request) and persistent
memory (replacing the old project's file-backed `MemoryStore`). Later TDDs
add their own tables to this same database via their own migrations — this
phase does not need to anticipate their schemas.

## Scope

**In scope:**
- Neon Postgres provisioning documented (env var: `DATABASE_URL`), with the
  `pgvector` extension enabled (even though `docs-store`'s actual vector
  table is 0004's job — enabling the extension here means 0004 doesn't need
  its own migration-tooling setup).
- A simple, boring migration approach — plain `.sql` files run via a small
  script (e.g. `scripts/migrate.ts` reading `migrations/*.sql` in order and
  applying any not yet applied, tracked in a `schema_migrations` table). No
  ORM — this matches the project's stated "boring stack" preference and
  keeps every later TDD's schema additions equally simple to review.
- `@langchain/langgraph-checkpoint-postgres` wired as the graph's
  checkpointer, keyed by a per-run `thread_id` (generated per request in a
  later TDD's route handler; this TDD just wires the checkpointer into
  `buildGraph()` from 0002 and proves it persists/resumes state).
- A `memory` table (or equivalent) replacing the old file-backed
  `MemoryStore` interface from the previous implementation: scoped by
  `(user_id, project_id)`, with `written_at` and nullable
  `invalidated_at`/`invalidated_reason` columns — same explicit-invalidation
  discipline as before (`ARCHITECTURE.md` of the previous implementation;
  this rebuild keeps that discipline, just on Postgres instead of files).

**Out of scope (later TDDs):**
- `docs-store`'s actual embeddings table and `analytics`'s cache table
  (0004) — this phase only enables the `pgvector` extension they'll need.
- Rate-limit table (0006).
- Run-trace table (0007).

## Interfaces

```ts
// lib/db/client.ts
export function getDb(): DbClient; // pooled Postgres client from DATABASE_URL

// lib/db/checkpointer.ts
export function getCheckpointer(): PostgresSaver; // from @langchain/langgraph-checkpoint-postgres

// lib/memory/store.ts
export interface MemoryStore {
  write(scope: { userId: string; projectId: string }, fact: string): Promise<void>;
  retrieve(scope: { userId: string; projectId: string }): Promise<MemoryRecord[]>;
  invalidate(id: string, reason: string): Promise<void>;
}
```

## Acceptance criteria (test-first)

- A unit test for the migration runner asserts it applies `.sql` files in
  order and skips already-applied ones (test against a mocked/in-memory
  representation of `schema_migrations`, not a real DB, for the default
  suite).
- A unit test for `MemoryStore` asserts `retrieve()` never returns a record
  scoped to a different `(userId, projectId)` than requested — the
  "no cross-leak" property the old project's memory model was built around,
  carried forward explicitly (mock the DB client for this test).
- A unit test asserts `retrieve()` excludes invalidated records by default.
- A **manual/real-API-suite test** (not in the default mocked suite, per
  `ARCHITECTURE.md` §8): against a real `DATABASE_URL`, run the graph from
  0002 with the Postgres checkpointer attached, interrupt/resume (or
  simulate a process restart between steps), and assert the resumed run
  continues from the correct state rather than restarting. This is the one
  property that's meaningless to fully mock — it has to be checked against
  real Postgres at least once.

## Notes for the implementing session

- Keep the migration script dependency-free (raw `pg` or Neon's driver, no
  migration framework) — this is a small project and an extra dependency
  here isn't earning its keep.
- Do not build the rate-limit or run-trace tables in this phase even though
  they'll live in the same database — let 0006 and 0007 add their own
  migrations when they actually need them, so each TDD's schema change is
  reviewable against the feature that needs it.
