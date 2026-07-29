# Architecture: AI Product Engineer Copilot

A multi-step agent that generates PRDs, user stories, experiment designs, architecture
reviews, and roadmaps for PMs/founders. This document is written before any code exists
(Phase 0) and is the source of truth for every design decision in this repo. It is also
draft material for article #2, "How MCPs Change AI Product Design."

Stack: TypeScript/Node, Anthropic API (Claude), Vitest. No frameworks beyond what's
needed to keep the interesting parts (planning, memory, evals, observability) visible.

---

## 1. Agent loop design: planning-then-execute vs ReAct

**Decision: explicit plan-then-execute, not ReAct.**

ReAct (interleaved reason → act → observe, one tool call at a time, next step decided
only after seeing the last result) is the default pattern for open-ended agents. I
rejected it here for four reasons specific to this system:

1. **The outputs are documents with internal structure.** A PRD has sections that
   depend on each other in a known order (problem statement → goals → requirements →
   success metrics). ReAct's step-at-a-time reasoning has no natural place to hold "the
   shape of the whole document" — it re-derives structure implicitly every turn. An
   explicit plan (an ordered step list, each step typed as `{ tool, purpose, dependsOn }`)
   makes that structure a first-class artifact instead of something latent in the
   model's context.

2. **Observability requires a plan to observe against.** Phase 5 needs per-step traces
   and a failure taxonomy that includes "planning" as a category. That only means
   something if planning is a discrete, inspectable step that can itself be wrong —
   distinct from a tool call being wrong. In ReAct, planning and execution are the same
   event, so you can't tag a trace as a planning failure vs a tool failure.

3. **Replanning needs a stable baseline to replan from.** Phase 2 requires "a failed
   step halts or replans; it does not proceed on stale state." That's well-defined
   against an explicit plan (you can diff the new plan against the old one, invalidate
   only the downstream steps that depended on the failed one). Against a ReAct trace,
   "the plan" is just the transcript, and replanning means re-reading the whole history
   and hoping the model doesn't repeat the mistake.

4. **Cost and latency are boring and predictable.** Plan-then-execute lets me emit a
   step count up front and enforce a max-step guard before any tool runs, rather than
   discovering runaway loops mid-flight.

**What I gave up:** ReAct is better when the right next action genuinely depends on
information you don't have yet (open-ended research, unknown search spaces). PRD/roadmap
generation is not that — the tool surface (docs-store, analytics) is small and the
document shape is knowable in advance. If a future step type needs genuine
observe-then-decide behavior (e.g., "keep querying analytics until you have enough
signal"), it will be modeled as a single plan step that internally loops (bounded), not
as a switch to ReAct for the whole agent.

**Loop shape:**

```
Planner(request) -> Step[]              // ordered, typed, acyclic
for step in Step[]:
    Executor(step, context) -> Result | Failure
    if Failure:
        Planner.replan(remainingSteps, failure) -> Step[]  // bounded retries
    context += Result
Assembler(context) -> final document
```

A "step" is a typed union: `{ kind: "tool_call", tool, args }` or
`{ kind: "generate", section, dependsOn }`. The planner never executes anything itself;
the executor never decides what comes next. This separation is what Phase 1's typed
tool-calling core and Phase 2's planner/executor split are testing.

---

## 2. Memory model

**Decision: two-tier memory — session context (ephemeral, in-process) and persistent
memory (durable, scoped, file/DB-backed) — with explicit promotion between tiers.**

- **Session context** is everything gathered during one run: the plan, tool results,
  intermediate generations. It lives only for the duration of the run and is passed
  explicitly through the loop above. Nothing here survives a process restart.

- **Persistent memory** is facts that should survive across sessions: prior decisions
  about a product, previously generated artifacts, user/project preferences. It is
  keyed by `(userId, projectId)` and nothing else — Phase 4's "no cross-leak" test
  exists because it would be easy to accidentally key memory globally or by
  conversation ID instead, which leaks one user's product facts into another's context.

- **Promotion, not automatic capture.** Not every session fact becomes a memory. A fact
  is written to persistent memory only when the agent (or user) explicitly flags it as
  durable ("remember that our target market is X"), mirroring the reference project's
  own memory-writing discipline. This avoids the harder problem of automatic salience
  detection and keeps memory content auditable — every stored fact traces back to a
  specific write, not an inferred one.

- **Invalidation is explicit and timestamped**, not TTL-based. A memory record carries
  `writtenAt` and an optional `invalidatedAt` + `invalidatedReason`. Retrieval filters
  out invalidated records by default but keeps them queryable for audit. TTL expiry was
  rejected because product facts (e.g., "our target market is X") don't decay on a
  schedule — they become wrong when a specific later decision contradicts them, which
  is an event, not a duration.

**Storage:** a local file-backed store (JSON per project, or SQLite if concurrent
access becomes necessary) behind a `MemoryStore` interface. The interface, not the
backing store, is the contract Phase 4's tests run against — this is one of the seams
Phase 6 needs to extract cleanly.

---

## 3. MCP boundary

**Decision: MCP servers are the only way the agent touches external systems. The agent
core has zero direct SDK/API imports for docs or analytics.**

Two MCP servers, matching Phase 3:

- **docs-store MCP**: retrieval over product docs/specs. Returns passages with source
  identifiers so generated output can cite them.
- **analytics MCP**: returns metrics (usage, funnel, experiment results). The agent must
  cite numbers that came from this server and is structurally prevented from inventing
  numbers that look like they did — see the hallucination test in Phase 5.

**Why MCP instead of direct SDK calls:** the point of this project is to demonstrate
tool orchestration and graceful degradation, not to build the fastest possible PRD
generator. MCP forces a clean seam: the agent's tool registry (Phase 1) sees `docs-store`
and `analytics` as generic typed tools with schemas, no different from any other tool.
Swapping the analytics MCP server for a different backend should require zero changes
to the planner, executor, or eval harness — only a new server behind the same tool
name/schema. That seam is also what makes the Phase 6 extraction ("MCP registry/routing/
observability into MCP Toolkit") a real extraction instead of a rewrite: the registry
code never assumed anything about *these two* servers specifically.

**Failure handling:** an MCP call can fail (server unreachable, timeout, malformed
response). Per Phase 3's third test, this must degrade gracefully: the executor catches
the failure, logs it with a `tool` failure tag (Phase 5 taxonomy), and either (a) lets
the planner replan around the missing data, or (b) surfaces an explicit "data
unavailable" note in the final document rather than fabricating a substitute. It must
never crash the run and must never silently substitute a plausible-looking value.

**Rejected alternative:** treating MCP as an optional enhancement layered on top of
direct API calls ("use MCP if available, fall back to direct SDK"). Rejected because it
would mean two code paths doing the same thing, only one of which is ever exercised in
demos — the opposite of "keep the interesting parts visible."

---

## 4. Eval strategy

**Decision: offline golden-set regression eval + LLM-as-judge, not human labeling, as
the primary correctness signal — with explicit bias checks on the judge itself.**

**Why LLM-as-judge over human labels:**
- Throughput: the golden set needs to run on every change (regression gate), which
  human labeling can't sustain at CI speed.
- Consistency: a rubric-driven judge applies the same criteria every run; a human
  grader's standards drift over a session and between graders.
- The real risk isn't "should I use a judge" — it's an ungrounded judge. So the design
  puts effort into anchoring and bias-checking the judge rather than avoiding it:
  - **Sanity anchors**: fixed known-good and known-bad outputs the judge must score
    correctly before its verdicts on real cases are trusted. If the judge can't
    separate an obviously-good PRD from an obviously-bad one, its opinion on a
    borderline case is worthless — this is a precondition check, not just another test.
  - **Structured, parseable judge output**: `{ score, rationale, citedEvidence }` as a
    typed schema (reusing the Phase 1 tool-calling core — the judge's own output is
    itself a typed tool result). Free-text verdicts can't be regression-checked
    programmatically.
  - **Position/verbosity bias check**: swapping the order of A/B outputs, and padding
    one response with harmless extra length, shouldn't flip which one wins beyond a
    defined threshold. This is a known, well-documented failure mode of LLM judges
    (order bias, length bias) and is tested directly rather than assumed away.

**Golden set representativeness:** cases are derived from the actual tool surface (docs-
store hit, docs-store miss, analytics available, analytics unreachable, ambiguous
request needing clarification) rather than hand-picked "nice" examples, so the set
exercises the failure taxonomy (§5) by construction, not by luck. The known gap: the
golden set is authored by one person (me) and will under-represent product domains and
user phrasing I haven't thought of — this is the honest limit of the current set and the
first thing to grow if the eval starts passing more than the real system deserves.

**Reproducibility:** fixed temperature (0 where the task allows deterministic
comparison) and fixed model version pinned per eval run, with the run's config recorded
alongside its results. Determinism isn't guaranteed by fixed temperature alone at the
API level, so reproducibility here means "same inputs, same rubric, comparable score
distribution," not bit-identical output — that distinction is recorded so it isn't
oversold later.

**Rejected alternative:** pure human review as the release gate. Rejected not because
human judgment is worse, but because it doesn't scale to "runs on every change," which
is the actual requirement (a regression gate). Human review still has a place — spot-
checking the judge's own calibration — but it isn't the gate.

---

## 5. Failure taxonomy

**Decision: four tags — `hallucination`, `planning`, `tool`, `context` — applied per run,
zero or more per run, derived from structured signals rather than free-text judge
guesses.**

- **hallucination**: output contains a claim (especially a number) not traceable to a
  tool result or provided input. Detected primarily by cross-referencing cited figures
  against the analytics MCP response for that run — this is why analytics results must
  carry stable identifiers the checker can match against.
- **planning**: the plan itself was wrong (wrong step order, missing a necessary step,
  a step that couldn't succeed given its dependencies) — distinct from a step executing
  correctly but the plan being unnecessary or misordered. This tag exists *because* the
  loop is plan-then-execute (§1); it wouldn't be assignable in a ReAct trace.
- **tool**: a tool/MCP call failed or returned an error, independent of whether the
  agent recovered gracefully.
- **context**: the agent had the right information available but failed to use it
  (ignored retrieved docs, contradicted its own earlier step).

**Why four and not more:** each tag maps to a different fix (better retrieval, better
planner prompting, better error handling, better context assembly) and each maps to a
different part of the system under test. A finer-grained taxonomy was rejected for now
because Phase 5 needs the taxonomy to be checkable by an eval case (the hallucination
test fabricates a wrong analytics number and asserts it gets caught), and a tag that
can't be exercised by a concrete test case isn't earning its keep yet. The taxonomy is
expected to grow post-launch, driven by tags real runs actually need, not speculative
categories.

**Known gap:** this taxonomy doesn't yet distinguish "MCP unreachable" (infra) from
"MCP reachable but returned wrong/incomplete data" (semantic) — both currently tag
`tool`. That split is deferred until there's a real case that needs it, per the
project's own no-speculative-abstraction stance.

---

## 6. Observability schema

**Decision: per-step trace records, append-only, keyed by run ID, with cost computed
from token counts rather than estimated.**

```
Run {
  runId
  startedAt, endedAt
  request
  finalOutput
  totalCostUsd            // sum of step costs
}

StepTrace {
  runId
  stepId
  stepKind: "plan" | "tool_call" | "generate" | "judge"
  startedAt, latencyMs
  inputTokens, outputTokens, costUsd
  failureTags: FailureTag[]     // §5, zero or more
  raw: { input, output }        // for debugging, not for the eval gate
}
```

- **Latency and cost per step, not just per run.** A run-level total tells you the
  system is slow; a step-level trace tells you *which* step (planning vs a specific
  tool call vs generation) is slow or expensive, which is the actual actionable signal.
- **Cost is computed, not estimated.** Every step trace stores actual input/output
  token counts from the API response; run cost is a sum, not a separate estimate that
  can drift from reality.
- **Traces are queryable by failure tag** (§5) so "show me every context-failure trace
  from the last 100 runs" is a query, not a manual transcript search — this is the
  concrete requirement Phase 5's observability tests check.
- **Storage:** same file/SQLite-backed store as memory (§2), different table/namespace.
  Reusing the storage layer rather than standing up a separate observability backend
  keeps the "boring stack" promise and keeps the seam Phase 6 needs (MCP Toolkit takes
  the registry + observability, not a bespoke DB).

**Rejected alternative:** wiring a third-party observability/tracing SaaS immediately.
Rejected for now because the interesting part of this project is *designing* the trace
schema and taxonomy myself (this is Gap #2 work), not integrating a vendor. A vendor
export can be added later behind the same `StepTrace` shape without changing the schema.

---

## 7. Summary of rejected alternatives

| Decision point | Rejected | Why |
|---|---|---|
| Agent loop | ReAct | No stable plan to observe/replan against; can't separate planning failures from execution failures |
| Memory capture | Automatic salience-based capture | Unauditable; every stored fact should trace to an explicit write |
| Memory expiry | TTL-based | Facts go stale on events (contradiction), not on a clock |
| MCP usage | "MCP if available, else direct SDK" fallback | Two code paths, only one ever exercised; defeats the point of the project |
| Eval gate | Human-only review | Doesn't scale to a per-change regression gate |
| Failure taxonomy | Fine-grained tags from day one | Tags not backed by a concrete eval case aren't earning their keep |
| Observability backend | Third-party tracing SaaS from the start | The schema/taxonomy design is the point of this phase, not vendor integration |

---

## 8. Extraction seams (for Phase 6)

Two seams are being kept clean on purpose, from Phase 3/5 onward:

- **Agent Evaluation Framework**: eval harness + judge + taxonomy (§4, §5) must not
  import anything from the planner/executor beyond a `Run`/`StepTrace` shape it can
  consume generically. It should be runnable against *any* agent that emits traces in
  this shape, not just this one.
- **MCP Toolkit**: the tool registry, MCP client routing, and observability store (§3,
  §6) must not know that the two servers are specifically "docs-store" and "analytics."
  They are registered by name/schema like any other tool.

Both seams are tested implicitly by Phase 1–5's own test suites: if a test needs to
reach into planner internals to verify eval or observability behavior, the seam has
already been violated.
