# TDD 0012 — Durable results and shareable run permalinks

**Depends on:** 0002 (the assembled result this persists), 0003 (Postgres),
0005 (the streaming route that produces the result and the UI that renders
it), 0006 (the rate limit that makes a lost run expensive), 0007 (`run_id`,
and the `/trace/[runId]` page this mirrors), 0010 (a run can span two legs).
**Unblocks:** nothing queued.

## Context

Every TDD through 0011 built the system that *produces* five deliverables.
None of them made a produced deliverable outlive the browser tab it was
streamed into.

Concretely, as shipped: `app/api/generate/route.ts` ends a run by emitting a
`result` event, `app/page.tsx` puts it in `useState`, and `ResultView`
renders it. That is the entire lifetime of the output. A refresh, a
navigation, a closed laptop, or a phone dropping to sleep mid-run destroys
it, and there is no way to get it back — the graph is not idempotent, so the
same request re-run produces different documents.

Three things already in the system make that worse than it sounds:

- **A run is slow.** The PRD → fan-out(3) → roadmap shape is sized against a
  300s ceiling (§5). A visitor who loses the output loses several minutes.
- **A run is rationed.** §6 allows 5 runs per hour per IP. Losing one output
  costs 20% of a visitor's hourly budget, and the *retry* is charged too.
- **The metrics already outlive the output.** This is the part that reads as
  a defect rather than a missing feature. `/trace/[runId]` will happily show
  a run's per-node latency, token counts, and cost — hours later, to anyone
  with the link — for a run whose five documents are unrecoverable. The
  system durably remembers what a run *cost* and forgets what it *produced*.

That asymmetry is an accident of sequencing, not a decision anyone made:
0007 needed a table to answer "what did this run do", and the result had no
table because nothing had needed one yet. Nothing in `ARCHITECTURE.md`
defends the current behaviour, because the current behaviour was never
argued for.

This phase closes it with the seam 0007 already established: one row per run,
keyed by the same `run_id`, and a server-rendered page at the sibling route.

## Scope

**In scope:**

- **A `run_results` table** (`migrations/0008_create_run_results.sql`): the
  assembled result JSONB plus the request text that produced it, keyed by
  `run_id`.
- **A record/read module** (`lib/results/record.ts`): `recordRunResult` and
  `getRunResult`, injected `DbClient`, mirroring `lib/tracing/record.ts` and
  `lib/eval/record.ts` down to the test shape.
- **Persistence in the route**: after a leg produces a result, write the row
  — *best-effort*, on the same discipline as 0007's trace write, so a
  persistence failure is logged and never converted into a user-visible run
  failure.
- **A permalink page** (`app/run/[runId]/page.tsx`): server-rendered, fetches
  the row directly, and re-renders the *same* `ResultView` component the live
  run used. A run with no stored result gets an explicit not-found state,
  worded like the trace page's.
- **Cross-links**: the completed run links to its permalink beside the
  existing "View trace" link, and the permalink and trace pages link to each
  other.

**Out of scope (and why):**

- **A list of past runs.** There is no identity to scope a list by — the same
  wall §9 and §4 hit with the `memory` table, and hashed IPs are deliberately
  not an identity (§6). A per-run link the visitor already holds needs no
  identity; "my runs" does. Faking it with a cookie would invent the concept
  of a user for one page.
- **Auth on the permalink.** See below — the URL is the capability, and that
  is stated plainly rather than dressed up.
- **Export (Markdown/PDF/copy-all).** A real gap, but a different one: it's
  about getting output *out of* this system, while this phase is about output
  continuing to exist inside it. Cheap to add on top of a stored row later.
- **Regenerating or editing a stored run.** Would make `run_results` mutable
  state with an edit history, which is a product, not a fix.
- **Retention/expiry.** Rows are small and the demo's volume is bounded by
  §6's limiter; a TTL invented now would be a guess. Noted as a real
  operational question in Consequences rather than answered arbitrarily.

## Design

### Why there is no foreign key to `run_traces`

`run_evals` (0011) is `REFERENCES run_traces(run_id) ON DELETE CASCADE`, and
copying that here would be the obvious move. It would be wrong.

The two writers have different reliability contracts. The eval harness
controls both rows and writes them in order, so an eval without a trace is a
bug worth rejecting. But 0007 made the trace write explicitly *best-effort*:

> a failure to *write* the trace is logged but never turned into a
> user-visible run failure

So a trace row is not guaranteed to exist. With an FK, a failed trace write
would make the result insert fail too — and by that same best-effort rule the
failure would be swallowed. A transient error writing *metrics* would
silently destroy the *deliverables*, which is exactly backwards: of the two
rows, the result is the one that matters to the person who waited five
minutes for it.

So `run_results` stands alone, keyed by `run_id` by convention like every
other per-run table. The cost is that a deleted trace can leave a result
behind — an orphan that the permalink still renders correctly, since the page
needs nothing from the trace row.

### The request text is stored with the result

A stored plan is close to unreadable without the request it answers — the
deliverables reference "the product" throughout and never restate it. The
permalink is also the one surface where the reader may not be the person who
typed the request, so it can't rely on their memory of it.

It is copied onto `run_results` rather than read out of the checkpointer at
render time: the checkpointer's state is LangGraph's, keyed by `thread_id`
and shaped by the graph's needs, and reaching into it from a page would
couple a UI route to the graph's internal persistence — and a checkpoint may
legitimately be pruned while the result should still render.

The two legs get it from different places, which is worth stating rather than
hiding. A fresh run has the request in hand — it's the request body. A
resumed leg (0010) doesn't, so it takes `request` from the state snapshot
`resumeRun` *already fetches* to decide whether the run is parked at an
interrupt. That's one read of the checkpointer, on a path that had already
paid for it, rather than a second query.

### The URL is the capability, and the page says so

There is no auth in this project (§4, §6, §9) and this phase does not invent
any. Access control on a permalink is the unguessability of the `run_id`: a
server-minted v4 UUID, which is the *same* property `resumeRun` already
depends on to keep a paused run from being resumed by a stranger.

This is a real, if modest, property — but it means anyone holding the link
sees the run, and a visitor's request text is free-form and may be something
they'd rather not hand around. Two consequences, both taken:

1. The permalink is presented as a *share* link, not a private one, so a
   visitor who copies it knows what they're copying.
2. Nothing enumerates run IDs. There is no index route and no listing (see
   Scope), so a run is reachable only by its own URL.

Storing visitor-typed text at all is a new fact about this system, so it is
recorded in the README's honest-edges paragraph rather than left implicit in
a migration file.

### A pause writes nothing

A run that parks at `clarificationGate` (0010) ends its first leg with a
`clarification-request` and no result. There is nothing to store, and a row
of nulls would make "the run is unfinished" and "the run failed" the same
state. The second leg produces the result and writes the row.

The write is an upsert on `run_id` anyway, for the same reason 0007's is:
under a retry or a resumed leg the run must stay one row.

### The permalink re-renders `ResultView`, not a copy of it

The stored value is the `AssembledResult` the live UI was handed, so the
permalink mounts the same component. A degraded section (0002's contract)
renders degraded on the permalink because the `errors` array is stored with
it — a shared plan shows the same warnings the visitor saw, rather than
quietly presenting a partial run as a complete one.

That means `ResultView` — a client component — is rendered from a server
page, which is exactly how `/trace/[runId]` already renders `TraceView`.

## Test plan

Mocked suite (`npm test`, no keys, in CI):

- `recordRunResult`: insert shape against a fake DB, upsert on conflict
  (a resumed or retried run stays one row), round-trip through
  `getRunResult`, `null` for an unknown run, and date normalization matching
  `getRunTrace`'s.
- The route: a completed run writes a result row; a run that pauses at the
  gate writes none; a *failing* write is logged and still emits the normal
  `result` event (the best-effort contract — the regression this protects
  against is a persistence bug being upgraded into a failed run).
- The permalink page: renders the deliverables for a stored run, renders the
  not-found state for an unknown one, and shows a degraded section as
  degraded.
- `RunView`: the permalink appears on a completed run alongside the trace
  link, and neither appears without a `runId`.

Nothing here needs a real model or a real database, so it all lands in the
mocked suite — this phase adds no fourth test mode.

## Consequences

- `ARCHITECTURE.md` §5 and §7 describe a run whose output is durable, and
  §10 records the rejected alternatives (FK to `run_traces`, a listing page,
  auth on the permalink).
- The README's status section stops describing a system that forgets its own
  output, and its honest-edges paragraph gains the two real ones this
  introduces: the link is the only access control, and stored runs currently
  have no expiry.
- `app/WhatsNextNote.tsx` is untouched. It names what the system deliberately
  doesn't do; losing your output was never a deliberate choice, so it was
  never listed there.
- Retention is now a live operational question — rows accumulate at up to
  5/hour/IP and nothing prunes them. Small (five documents of text), bounded,
  and cheap on Neon's free tier for a demo, but a real deployment would want
  a TTL. Named here rather than guessed at.
