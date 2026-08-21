# TDD 0014 — Chat-style UI with a workspace panel

**Depends on:** 0005 (the streaming route, event protocol, and page this
restructures), 0010 (the clarification pause this folds into the thread),
0012 (`ResultView`, reused unchanged by the permalink).
**Unblocks:** 0015, which fills the workspace panel's second tab with the
animated graph.

## Context

The current page is a form. You type into a `<textarea>`, press "Generate
plan", and the page fills top-to-bottom with a progress list, then a
tabbed result card. It works, and 0005 built it deliberately as the
smallest thing that could render a streaming run honestly.

What it doesn't do is *read* like the thing it is. This system asks a
clarifying question and waits for an answer — a genuine turn-taking exchange,
built in 0010 — but renders that exchange as a form that appears below
another form. The interaction is conversational; the interface is a
submission pipeline.

The redesign moves to the layout the interaction actually has, which is the
one claude.ai uses: a conversational thread on the left, and a workspace
panel on the right holding the substantial artifact the conversation
produced. The five deliverables are exactly that kind of artifact — long,
tabbed, re-readable, not something you scroll past in a message log.

**This is a re-skin plus a restructure, not a new capability.** No route
changes, no state-model change beyond what the layout requires, no
backend work. The stream, the events, the graph, and `ResultView` itself are
untouched.

## The decision this phase does *not* make

A chat UI invites an obvious next step: multi-turn. Submit a second request
after a result and have it append as a new exchange in the same thread.

That is explicitly out of scope, and the reason is that it is a product
decision wearing a UI decision's clothes. Every run today is one
`thread_id`, one checkpointed graph execution, one row in `run_results`, and
one unit against the 0006 rate limit. "Another turn in the same conversation"
would have to mean either a second independent run that merely *looks*
related — a lie the UI tells — or genuine conversational state across runs,
which is 0004's `memory` table, which needs the identity §4 says this demo
deliberately doesn't have.

So: chat-*styled*, single-run. The visual metaphor stops exactly where the
backend's model of a run stops, rather than implying continuity that isn't
there. This is the same discipline 0010 applied when it built one pause
rather than a chat loop.

## Scope

**In scope:**

- **Two-panel layout.** Left: a narrow conversational thread. Right: a
  workspace panel. Above ~900px they sit side by side; below, they stack with
  a toggle (Chat / Result, gaining Graph in 0015) showing one at a time —
  mirroring claude.ai's own mobile behaviour, where the artifact panel becomes
  a view you switch into rather than a column that shrinks.
- **The thread**, rendering in order: the visitor's request as a user turn;
  the supervisor's routing decision as a short assistant line (this is the one
  piece of narration the graph in 0015 can't carry as a node label, so it
  stays as text); the clarification exchange, if any; and a minimal
  in-progress status while the run is live.
- **Clarification as chat turns.** The questions render as an assistant
  message — numbered, with inline inputs beneath — and submitting appends the
  answers as a user message. The "skip and proceed on assumptions" path stays
  a first-class button, per 0010: proceeding on stated assumptions is a
  legitimate outcome, not an abandoned form.
- **The workspace panel** holds the existing `ResultView` (tabs and all,
  unchanged) once a result arrives, behind a tab strip that 0015 extends with
  a Graph tab. Before then it shows an empty/working state.
- **`ProgressLog.tsx` is deleted.** Its per-node and per-MCP-call detail is
  what 0015's graph exists to show, and rendering the same events as both a
  text list and an animated graph is duplication that will drift. Until 0015
  lands, the thread shows a plain "Working on it…" line, which is a
  *deliberate temporary regression* in progress detail — see below.
- **CSS**: chat/thread/panel classes added to `app/globals.css` using the
  existing token system (`--surface`, `--border`, `--accent`, …), consistent
  with how every other component in this app is styled.

**Out of scope:**

- **Multi-turn conversation** — see above.
- **The graph** — 0015. This phase leaves a placeholder tab.
- **Any change to `app/api/generate/route.ts`, the event protocol, or the
  graph.** If this TDD's diff touches `lib/`, something has gone wrong.
- **Permalink restructuring.** `/run/[runId]` and `/trace/[runId]` keep their
  current shape here; 0015 merges them, because the merge only makes sense
  once there's a Graph tab to merge *into*.

## The temporary regression, stated plainly

Deleting `ProgressLog` before 0015 exists means that between these two
phases, a running graph shows less than it does today: "Working on it…"
instead of a live per-node list with MCP calls.

The alternative — rewriting `ProgressLog` into the new layout, then deleting
it one TDD later — is throwaway work on a component that is being replaced by
design. Accepting a visible gap for one phase is the cheaper and more honest
option, but it does mean **0014 and 0015 should land close together**, and
that shipping 0014 alone to production is a downgrade in the run's
legibility. If only one of the two can ship, ship neither.

## Acceptance criteria

- A full run — request, clarification, answers, result — reads as one
  conversational thread, with deliverables in the workspace panel.
- The clarification exchange renders as message turns; skip remains
  available and obvious.
- Below the breakpoint, panels stack and the toggle switches between them;
  nothing is unreachable on a phone.
- `ResultView` is reused without modification (its tests should not need to
  change).
- No file under `lib/`, `mcp/`, or `app/api/` is modified.
- Existing page/component tests are updated to the new structure, and the
  clarification and rate-limit behaviours keep their current coverage.

## Notes for the implementing session

- **The thread is narrow on purpose.** Long-form deliverables belong in the
  panel; a thread that grows a wide message bubble full of a 12,000-character
  roadmap has reinvented the current layout.
- **Keep `page.tsx`'s state shape as close to today's as the layout allows.**
  The temptation is to model a `messages[]` array, but with one run and a
  fixed sequence of turns, derived rendering from the existing
  `status`/`events`/`questions`/`result` state is simpler and doesn't smuggle
  in the multi-turn model this TDD declined.
- **The rate-limit banner and the honest-edges note** (`RateLimitNote`,
  `WhatsNextNote`) both still need a home. They are context *about the demo*,
  not turns in the conversation — above the thread rather than inside it.
