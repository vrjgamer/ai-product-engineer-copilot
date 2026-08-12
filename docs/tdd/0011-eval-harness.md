# TDD 0011 — Golden-set eval harness (LLM-as-judge, calibrated, gated)

**Depends on:** 0001 (model provider seam), 0002 (graph shape and the
assembled result), 0003 (Postgres — the eval rows live beside the trace
rows), 0007 (run tracing, whose `run_id` this keys off), 0008 (the test-mode
split this adds a third mode to), 0010 (a run can pause, so the harness has
to handle a pause).
**Unblocks:** nothing queued — this closes the last capability
`ARCHITECTURE.md` §9 deferred out of v1.

## Context

§7 chose a lightweight run trace over the previous project's full eval/rigor
layer, and §9 kept that layer named as deferred rather than quietly dropping
it, along with the two seams a later version would attach to:

> `run_traces` records what a run *did* (latency, tokens, cost, MCP calls)
> but nothing about whether the output was any *good* — there is no quality
> column, and deliberately so. A later eval layer has two clean seams to
> attach to: the trace row itself (a judge score per run, alongside the
> existing per-node data) and the test split from §8, where a golden-set
> harness would be a third mode next to the mocked `npm test` and the manual
> `npm run test:e2e` — it needs real model calls, so it can't join the CI
> suite without changing that decision's terms.

This phase builds exactly that, and takes both constraints at their word: the
score attaches to the existing run ID rather than to a new concept of a
"run", and the harness is a third manually-invoked mode rather than a
CI job.

One thing §7's original framing got wrong is worth stating plainly, because
it shaped the design here. The reason to defer the eval layer was never that
scoring is hard — it's that a *regression gate* needs something to gate:
production traffic, change volume, a deploy process. That's still mostly
true. What changed is that the project now has five real deliverables
produced by a real graph, and no way to tell whether a prompt edit made any
of them worse. That's a small, concrete need, and it's met by a small,
concrete harness — not by standing up an eval platform.

## Scope

**In scope:**

- **A rubric and a four-tag failure taxonomy** (`lib/eval/rubric.ts`): four
  dimensions scored 1–5 (specificity, coherence, actionability,
  completeness) and four tags (`unsupported-claim`, `missing-requirement`,
  `internal-contradiction`, `generic-filler`). One deliverable per judge
  call.
- **A judge** (`lib/eval/judge.ts`, `lib/eval/judgeModel.ts`) running through
  the same provider seam as the graph, but resolved from its own
  `JUDGE_PROVIDER`/`JUDGE_MODEL_ID` (falling back to the graph's), so grading
  with a different — ideally stronger — model is one env var.
- **Calibration controls** (`lib/eval/calibration.ts`, `eval/golden/controls.json`):
  fixed documents with known verdicts that check the *judge* before any of
  its scores are believed.
- **A golden set** (`eval/golden/cases.json`) of three requests, each with
  deterministic, model-free `mustMention` expectations
  (`lib/eval/checks.ts`) alongside the judged score.
- **A regression gate** (`lib/eval/gate.ts`) comparing a run against a
  committed baseline (`eval/baseline.json`), with an absolute floor, a
  regression tolerance, and failures for missing deliverables and unmet
  expectations.
- **A harness** (`scripts/eval.ts`, `npm run eval`) that runs the real graph
  over the golden set, judges it, prints a report, exits non-zero on failure,
  and can snapshot a passing suite as the new baseline.
- **Persistence and surfacing**: `migrations/0007_create_run_evals.sql` +
  `lib/eval/record.ts`, and a quality section on `/trace/[runId]` for the
  runs that have one.

**Out of scope (and why):**

- **Judging live visitor runs.** Five extra model calls per run roughly
  doubles the spend on a demo whose cost argument (§2) is that it's cheap,
  and adds latency inside a 300s ceiling (§5). The trace page says a run
  wasn't judged rather than leaving the section blank.
- **Running in CI.** §8 decided against secrets and spend in CI, and this
  costs more per invocation than `test:e2e` does. It stays a pre-deploy
  command.
- **Pairwise / preference judging.** Comparing two candidate outputs is a
  better instrument than absolute scoring, but it needs two systems to
  compare, and prompt-to-prompt A/B is a different workflow than "did today's
  change break anything".
- **Human-labelled ground truth.** The golden set carries expectations, not
  reference answers. Writing five gold-standard PRDs and scoring similarity
  to them would measure conformity to one author's taste.

## Design

### Why the judge is checked before the system is

An LLM judge is an instrument with a bias profile, and the most common
failure is leniency: it awards 4s to anything fluent and well-formatted.
A suite average produced by such a judge is unfalsifiable — it moves when the
judge drifts, and you can't distinguish that from the product changing.

So `eval/golden/controls.json` holds two fixed documents:

- a **bad** control — a fluent, well-structured PRD that names nothing from
  the request (no clinic, no reminder, no HIPAA, no number), which the judge
  must score **≤ 3**;
- a **good** control — user stories with concrete acceptance criteria tied to
  the request's stated 6-minute baseline and 2-minute target, which the judge
  must score **≥ 3.5**.

The bounds are a wide band around the middle on purpose: this checks that the
judge can tell these two apart at all, not that it agrees with a number.
Calibration runs *first* in `scripts/eval.ts` and is fatal — a failure exits
before spending anything on graph runs, and `evaluateGate` refuses to compare
against the baseline, reporting "the instrument is broken" instead of a list
of what look like product regressions.

That is the concrete version of §9's "LLM-as-judge with bias checks". The
prompt-level mitigations are real but secondary, and are not trusted on
faith: one deliverable per call (no position bias, no strong PRD carrying a
weak roadmap), an explicit instruction that length is not quality, and
evidence quoted before scoring.

### Two layers of grading, because a judge is noisy

Every case is graded twice, by instruments with different failure modes:

1. **Deterministic checks** (`mustMention`, case-insensitive substring): did
   the architecture review mention HIPAA when the request said the data is
   HIPAA-regulated? That's a fact, and delegating a fact to a grader that can
   be talked out of it is a category error. These are exact and can be
   evaluated by a human in their head.
2. **The rubric score**: everything a substring can't capture.

A case fails on either. The scores move with judge noise; the checks don't.

### What the gate fails on, and what it only notes

Five failure kinds, in priority order: calibration (alone, short-circuiting),
a missing deliverable, an unmet expectation, a score below the absolute floor
(3.0), and a drop of more than 0.25 below the committed baseline.

The 0.25 tolerance is a judgement call about noise, not a target: a judge
re-scoring the same document moves by a couple of tenths, and a gate that
fires on that gets switched off within a week, which is strictly worse than a
slightly loose one.

Two things are deliberately *notes* rather than failures. A newly-appearing
failure tag — the taxonomy exists to make a change diagnosable, and a tag
that appears while the score holds is information for a human. And a baseline
recorded by a different judge model, which suspends the regression comparison
entirely: scores from two graders aren't comparable, and firing a regression
on every case because someone set `JUDGE_MODEL_ID` would train people to
ignore the gate.

`--update-baseline` refuses to record a failing suite. A gate that can
launder a regression into its own baseline isn't a gate.

### A missing deliverable is not a 1/5

If a node fails, `judgeRun` lists that deliverable in `missing` and excludes
it from the mean instead of scoring it 1. An unwritten document is an
availability failure — already visible in `result.errors` and the run trace —
and folding it into the quality mean would make an outage look like bad
writing, which is the wrong diagnosis pointing at the wrong fix. The gate
fails on it on its own terms.

Likewise, a judge that won't return parseable JSON twice in a row raises
rather than scoring 0: a broken instrument must never be reported as a bad
product.

### How the harness runs a case

One case = one real graph run with its own `run_id`, wrapped in
`withRunTracing` exactly as the route does, so the harness's runs write real
`run_traces` rows and are inspectable at `/trace/<runId>` like any other. The
`run_evals` row is keyed by the same ID (with an FK to `run_traces`), which
is the §9 seam taken literally.

Cases run sequentially — five concurrent runs would race the provider's rate
limits, and a harness that fails on 429s teaches nothing about quality.

A case that trips TDD 0010's clarification gate is resumed with *empty*
answers, the same thing the UI's skip button does, and the report says it
happened. Golden requests are written to be specific enough not to pause, so
a pause is itself a signal about the supervisor's triage; feeding it canned
answers would hide that, and would grade a request the case file doesn't
contain.

### Why `run_evals` is a separate table

A trace is written by every run; an eval by the handful the harness produces.
Columns on `run_traces` would be null for essentially every row. The FK ties
them together and `ON DELETE CASCADE` keeps a deleted trace from leaving an
orphaned score.

## Test plan

Mocked suite (`npm test`, no keys, in CI):

- Rubric prompt construction and judgment parsing, including the tolerance
  for fenced JSON, dropping out-of-taxonomy tags, and *throwing* on a missing
  or out-of-range dimension rather than defaulting it.
- `judgeRun`: one call per deliverable, missing/blank deliverables excluded
  from the mean, no `NaN` when a run produced nothing, cost summed.
- Calibration: a lenient judge fails, a severe judge fails, a discriminating
  one passes, bounds inclusive.
- Deterministic checks, including a phrase present in the wrong deliverable.
- The gate: every failure kind, tolerance boundaries, judge-swap suspension,
  new-tag notes, and `buildBaseline`'s rounding/sorting.
- Golden set parsing — run against the *committed* `eval/golden/` files, so a
  malformed fixture fails the mocked suite rather than the manual harness.
- `run_evals` upsert/read against a fake DB, and the trace page's quality
  section (including the unjudged case).

Manual (`npm run eval`, real keys + DB): the harness itself. It isn't in
`npm run test:e2e` either — `test:e2e` proves wiring in seconds per script,
while this runs the full graph three times and is a pre-deploy check, not a
smoke test.

## Consequences

- `ARCHITECTURE.md` §7, §9, §10, §11 and the README's status/TDD table
  describe a shipped eval layer instead of a deferred one; §9 no longer has a
  "still deferred" subsection.
- `app/WhatsNextNote.tsx` had to get *more* precise rather than shorter: "nothing
  scores it" became false, but "it's scored" would imply the visitor's own
  run was, which it wasn't.
- `eval/baseline.json` is not committed by this TDD — it can only be produced
  by a real run with real keys. Until someone records one, the gate enforces
  the floor and says the baseline is missing.
