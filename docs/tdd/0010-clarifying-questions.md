# TDD 0010 — Clarifying Questions (interrupt and resume)

**Depends on:** 0002 (graph shape and node contracts), 0003 (Postgres
checkpointer — the pause is only durable because state is checkpointed),
0005 (streaming route and progress protocol), 0007 (run tracing).
**Unblocks:** nothing queued — this closes the first of the two capabilities
`ARCHITECTURE.md` §9 deferred out of v1.

## Context

`ARCHITECTURE.md` §9 named clarifying-question / human-in-the-loop support
as "the natural v2 feature", and TDD 0009's pass over that section did the
useful thing of enumerating exactly what was still missing rather than
leaving the claim abstract:

> `app/api/generate/route.ts` mints a fresh `thread_id` per POST and never
> accepts one, so there is no way for a client to name a run to resume; the
> stream protocol (`lib/graph/streamProtocol.ts`) has no event type for "a
> node is asking you something"; no node calls LangGraph's `interrupt()`;
> and the page is a one-shot form with no thread state.

This phase builds precisely that list. The half that was already proven —
that a graph interrupted mid-run resumes from durable checkpointed state in
a *separate* process (`scripts/checkpoint-roundtrip.ts`) — is not rebuilt
here; it is the foundation this sits on.

The product change is narrow and deliberate: when a request is too vague to
plan against, the run pauses **once**, before the PRD is written, asks up to
three questions, and continues with the answers folded in. It does not
become a chat. There is no multi-turn conversation, no second pause later in
the graph, and no clarification round after the PRD exists.

## Scope

**In scope:**

- **The supervisor finally makes a decision.** `lib/graph/nodes/supervisor.ts`
  currently returns `{}` and exists purely as a seam (`ARCHITECTURE.md` §1
  says so explicitly: "a seam, not a decision-maker"). It gains one model
  call that judges whether the request is answerable as written and, if not,
  emits up to `MAX_CLARIFYING_QUESTIONS` (3) short questions. A conditional
  edge out of `supervisor` routes to the new gate node when there are
  questions and straight to `prdAgent` when there aren't.
- **A new `clarificationGate` node** whose entire body is LangGraph's
  `interrupt()` call over the questions already in state, writing the
  answers back as `clarifications`. It is a separate node from `supervisor`
  on purpose — see "Why two nodes" below.
- **State** (`lib/graph/state.ts`) gains `clarifyingQuestions: string[]` and
  `clarifications: Clarification[]` (`{ question, answer }`).
- **`prdAgent` consumes the answers** and nothing else does. Every other
  deliverable already reads the PRD, which is where the answers land — this
  keeps the blast radius to one node and matches §1's "the PRD is the shared
  artifact" reasoning.
- **Stream protocol** gains `{ type: "clarification-request"; runId;
  questions }` — the "a node is asking you something" event 0009 flagged as
  missing.
- **The route accepts a resume.** `POST /api/generate` takes either
  `{ input }` (start) or `{ runId, answers }` (resume), the latter invoking
  the graph with `new Command({ resume: answers })` against that
  `thread_id`. A resume against a thread that is not actually paused at an
  interrupt is rejected — see "Rate limiting and the resume leg".
- **Trace continuity.** A paused run produces two invocations but must stay
  one `run_traces` row: the resume leg *appends* its node traces and adds to
  the run's cost rather than overwriting the first leg's.
- **UI.** A `ClarificationForm` rendered by `RunView` in a new
  `awaiting-clarification` status, with a "Skip — make assumptions" path
  that is a first-class option rather than an afterthought. The page keeps
  its accumulated progress events across the pause instead of resetting.
- **A real-API proof.** `scripts/clarification-roundtrip.ts`, added to
  `npm run test:e2e` (TDD 0008's manual suite). 0003's
  `checkpoint-roundtrip.ts` proves durability for `buildGraph`'s
  `interruptAfter` option; this proves it for the mechanism the product
  actually uses — a node calling `interrupt()` — with a real triage model
  call and a separately-constructed checkpointer standing in for the second
  HTTP request.
- **Docs.** `ARCHITECTURE.md` §1, §5, §9, §10 and `README.md`'s status
  section describe a system that can now pause; `app/WhatsNextNote.tsx` must
  stop telling visitors this doesn't exist.

**Out of scope:**

- **Any second pause.** One interrupt point, before the PRD. A node
  discovering ambiguity later states its assumption, exactly as today.
- **Multi-turn chat.** No message history, no follow-up on an answer, no
  re-asking. The user answers once and the run continues.
- **Wiring the `memory` table to the answers.** §9 notes the answers would
  finally give `memory` an identity to scope facts by — true, but that needs
  a notion of user identity this demo does not have (no auth, IPs are hashed
  and deliberately not an identity). Left alone rather than faked.
- **The eval/rigor layer** — §9's other deferred capability, untouched.

## Design notes

### Why two nodes, not one

The obvious implementation puts the model call and the `interrupt()` in the
same node. It is wrong here, for a mechanical reason: **a node that
interrupts re-runs from the top when resumed** — `interrupt()` returns the
resume value on the second pass instead of throwing, but everything above it
in the function body executes again. Generating the questions in that node
would therefore pay for the question-generating model call twice on every
clarified run, and could return *different* questions than the ones the user
just answered.

Splitting them puts the model call in `supervisor`, whose update is
committed to the checkpoint before the pause, so the resume leg re-runs only
the gate — whose body is a single `interrupt()` that immediately returns.

### Rate limiting and the resume leg

The limiter (TDD 0006) counts **runs**, and a paused run is one run. Charging
the resume a second unit would make an interrupted run cost double against a
5/hour budget for no added protection, so `checkRateLimit` stays on the start
path only.

That is only safe because a resume cannot buy free work: the route reads the
thread's state and rejects (HTTP 409) anything that is not currently parked
at an interrupt, so a completed or unknown `runId` cannot be replayed to
re-run the graph. The `runId` is a server-minted UUID, so it is also not
guessable by someone wanting to spend another visitor's paused run.

### GraphInterrupt is not a node error

`withNodeProgress` (TDD 0005) turns any throw into a `node-status`/`error`
event. `interrupt()` signals by throwing `GraphInterrupt`, which is control
flow, not failure — emitting an error event for it would show the visitor a
red "clarificationGate: error" line at the exact moment the UI is asking them
a question. The wrapper must recognize it and re-throw without emitting.

## Interfaces

```ts
// lib/graph/state.ts
export interface Clarification { question: string; answer: string }
// + clarifyingQuestions: string[], clarifications: Clarification[]

// lib/graph/streamProtocol.ts
| { type: "clarification-request"; runId: string; questions: string[] }

// app/api/generate/route.ts request body
{ input: string }                          // start a run
{ runId: string; answers: string[] }       // resume a paused one

// lib/tracing/record.ts
export function appendRunTrace(trace: RunTrace, db?: DbClient): Promise<void>
```

Graph shape after this phase (`ARCHITECTURE.md` §1's diagram, updated):

```
supervisor --(questions)--> clarificationGate --\
           \--(none)------------------------------> prdAgent -> [fan-out x3] -> roadmapAgent -> assembler
```

## Acceptance criteria

- A request the supervisor judges answerable produces exactly the run it
  produces today — same nodes, one pass, no pause. (The existing
  `lib/graph/index.test.ts` cases must keep passing on that path.)
- A request it judges ambiguous pauses at `clarificationGate`: the first
  `invoke` returns without a `result`, and the route streams a
  `clarification-request` event carrying the questions and the `runId`.
- Resuming that `runId` with answers completes the run, and the answers are
  present in `prdAgent`'s prompt.
- Resuming a `runId` that is not paused at an interrupt is rejected without
  invoking the graph.
- Skipping (empty answers) completes the run rather than blocking it.
- A supervisor model failure does not stall or fail the run — it proceeds
  unclarified, with a `NodeError` recorded so the degradation is visible
  rather than silent (the same contract §3 uses for MCP failures).
- The pause emits no `node-status`/`error` event for the interrupt.
- A clarified run leaves **one** `run_traces` row whose `nodes` include both
  legs and whose cost is the sum of both.
- `ARCHITECTURE.md`, `README.md`, and `app/WhatsNextNote.tsx` no longer
  describe clarifying questions as missing, and §9 retains only the
  eval/rigor item as deferred.

## Notes for the implementing session

- `MemorySaver` from `@langchain/langgraph` is what makes the interrupt path
  testable in the mocked suite — `interrupt()` requires a checkpointer, and
  the existing graph tests deliberately build without one. Passing a
  `MemorySaver` in the new tests only (not changing `buildGraph`'s default)
  keeps the no-checkpointer path exercised too.
- The supervisor's questions come back from a text model call, so parse
  defensively (fenced JSON, prose around the array, an object wrapper) and
  treat "couldn't parse" the same as "no questions" — a run that proceeds
  unclarified is a fine outcome; a run that crashes on a stray backtick is
  not.
