# TDD 0015 — Animated graph traversal, absorbing the trace page

**Depends on:** 0002 (the graph shape this draws), 0005 (the progress events
that drive it live), 0007 (`run_traces`, which drives the replay), 0011
(`run_evals`, whose quality section this rehomes), 0012 (`/run/[runId]`),
0014 (the workspace panel this fills).
**Unblocks:** nothing queued.

## Context

This system's central claim is that it is a *graph* — ARCHITECTURE §1 spends
its length defending PRD → fan-out(3) → Roadmap over a linear list, on the
grounds that the dependency ordering and the join point are what a graph buys
you. §1 then says the shape is "what a recruiter skimming the code should
notice as evidence of actual design."

Skimming the code is the only way to notice it. The running product renders
that structure as a flat list of node names in execution order, which is
precisely the shape §1 argues against — a list. The parallel fan-out, the
join before the roadmap, the conditional edge to the clarification gate: all
real, none visible.

The evidence is already on the wire. `node-status` and `mcp-call` events
(0005) carry everything needed to animate the real topology as it executes,
and `run_traces` (0007) stores enough to replay a finished one. Nothing new
needs to be measured or emitted; it needs to be *drawn*.

This phase also resolves an inconsistency 0012 left behind. A finished run
has two URLs — `/run/[runId]` for deliverables, `/trace/[runId]` for metrics —
which made sense when they were a document and a table. Once 0014 puts both
behind one panel with a tab strip for a live run, two separate pages for the
same run is the live UX contradicting itself.

## Scope

**In scope:**

- **A graph component** rendering the eight nodes of `lib/graph/index.ts` in
  their real topology: `supervisor` → (`clarificationGate` | `prdAgent`) →
  fan-out to three parallel agents → join at `roadmapAgent` → `assembler`.
  Node state (pending / running / complete / error / skipped) is driven by
  `node-status` events live, or by stored `nodes` on replay.
- **Tool-call leaves that appear as they happen.** Each agent node reserves
  slots for the MCP tools it can call; a leaf animates in when that node's
  `mcp-call` `started` event arrives and resolves on `completed`/`error`. The
  graph therefore *builds* as the run proceeds rather than sitting fully drawn
  from the first frame — which is the point, since the tool calls are the part
  that genuinely varies between runs.
- **Hand-rolled SVG**, no diagramming dependency. Justified below.
- **A Graph tab in 0014's workspace panel**, live during a run and readable
  after it.
- **`/trace/[runId]` is retired into `/run/[runId]`.** One page per run, same
  chat-thread-plus-workspace layout as the live run, fetching `run_results`
  and `run_traces` and tolerating either being absent (0012 deliberately has
  no FK between them, so both one-sided cases are real). The old route
  redirects rather than 404ing — trace links have been handed out, and 0012's
  whole argument was that a run's URL should keep working.
- **Compressed replay** for a stored run: nodes light in recorded order,
  parallel branches simultaneously, each held proportionally to its real
  latency but scaled so the whole traversal runs ~6–8s, with a replay control.
  A real run is 1–2 minutes; nobody watches that twice.
- **Per-node detail on selection.** Latency, token counts, and MCP calls — the
  data today's table shows — surface by selecting a node, so the trace table's
  information survives the format change rather than being dropped with it.
- **The quality-judgment section** (0011) moves below the panel, visible
  regardless of the selected tab: it describes the whole run, not one view of
  it. Its "this run wasn't scored" state stays exactly as honest as it is now.

**Out of scope:**

- **Pan/zoom/drag/minimap.** Eight nodes and a bounded set of leaves fit on
  screen. This is a diagram, not a canvas.
- **Per-token or per-node output streaming into the graph.** §2 already
  declined per-token streaming; the graph shows control flow, not content.
- **Changing what is emitted or stored.** If this phase needs a new event
  type or column, the design is wrong — with one honest exception noted below.

## Why hand-rolled SVG rather than React Flow

The topology is fixed and known at build time. The eight nodes and their
edges never change; the conditional edge to `clarificationGate` is the only
branch, and it has exactly two outcomes. The set of possible tool-call leaves
is likewise closed and statically known: two tools exist in the entire system
(`search_docs`, `get_repo_stats`), each node calls each at most once, and
there is no agent loop — `generateNodeText` invokes `generateText` *without* a
`tools` parameter, so the model never selects a tool at runtime.

What varies between runs is therefore *which* known elements are active and
when — a state problem, not a layout problem. A graph library's value is
layout: computing positions for a topology you don't know in advance. Paying a
dependency, a theming pass (the `github-markdown-css` variable-override
exercise, again), and a second visual language for a layout that can be
written down once is the wrong trade here.

**This reverses if the tool surface stops being static.** If a node ever gets
a real tool-calling loop where the model chooses tools at runtime, positions
become genuinely dynamic and a layout engine earns its place. Worth a comment
at the top of the component so the next person sees the condition rather than
re-deriving it.

## The one honest gap in replay

`lib/tracing/collect.ts` stores, per node, a latency and a *list of tool
names* — not per-tool-call timestamps. A live run can place each leaf exactly
when its event fires; a replay can only place leaves alongside their parent
node.

This is a real fidelity difference between the two modes, and the temptation
is to close it by adding timestamps to `NodeTrace`. Don't, in this phase: it
changes the stored schema and 0007's contract for a refinement to an
animation, and every already-stored run would still lack the data. Draw
replay leaves with their parent, and revisit only if the imprecision actually
misleads someone.

## Acceptance criteria

- A live run animates the real topology, including simultaneous fan-out, the
  join before `roadmapAgent`, and the conditional gate when it fires.
- Tool-call leaves appear on `mcp-call` `started` and resolve on
  `completed`/`error`; a degraded call is visibly degraded, not hidden (0002's
  contract, drawn).
- `/run/[runId]` serves deliverables and graph for a stored run;
  `/trace/[runId]` redirects to it; a run with only one of the two rows
  renders without error.
- Replay completes in a few seconds and can be restarted.
- Per-node latency/tokens/MCP calls remain reachable for every node the
  current table covers.
- The quality section appears below the panel and keeps its unjudged state.
- No changes to `lib/graph/`, the event protocol, or the trace schema.

## Notes for the implementing session

- **Drive the component from a derived view-model, not from raw events.** A
  pure `(events | storedNodes) -> GraphViewState` function is the whole
  testable surface, and it's what lets live and replay share one renderer.
  Test that; don't try to assert on animation.
- **`prefers-reduced-motion` must be honoured** — the existing pulse animation
  in `.node-row` already does this, and the graph is a much bigger motion
  surface. Reduced motion should still convey state, via colour and label.
- **Accessibility is not optional here** because this replaces a `<table>`
  that screen readers handled fine. The graph needs a text-equivalent — an
  offscreen ordered list of nodes with their states and stats is enough, and
  is roughly the table that's being replaced.
- **Two states are easy to forget**: a node never reached (the gate on a
  specific-enough request) and a run that ended in `fatal-error` partway
  through. Both should read as clearly distinct from "still running".
