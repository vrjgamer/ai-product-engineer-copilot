# TDD 0002 — LangGraph Core

**Depends on:** 0001 (model provider).
**Unblocks:** 0003 (checkpointing wraps this graph), 0004 (MCP tools get
called from these nodes), 0005 (the route handler runs this graph).

## Context

This is the graph itself — the part of the project the whole rebuild exists
to showcase. See `ARCHITECTURE.md` §1 for the full reasoning behind the
shape below; this TDD implements it with every model call mocked, so the
graph's *structure* (routing, state, the join point) is proven correct
before any real I/O is introduced.

## Scope

**In scope:**
- A LangGraph `StateGraph` with the following shared state shape (exact
  field names at the implementer's discretion, shape is not):
  - `request: string` — the raw user input.
  - `prd: PrdOutput | null`
  - `userStories: UserStoryOutput | null`
  - `architectureReview: ArchitectureReviewOutput | null`
  - `experimentDesign: ExperimentDesignOutput | null`
  - `roadmap: RoadmapOutput | null`
  - `errors: NodeError[]` — accumulated, not thrown — see graceful
    degradation below.
- Nodes: `supervisor`, `prdAgent`, `userStoryAgent`,
  `architectureReviewAgent`, `experimentDesignAgent`, `roadmapAgent`,
  `assembler`.
- Edges implementing the shape from `ARCHITECTURE.md` §1:
  `supervisor -> prdAgent -> [userStoryAgent, architectureReviewAgent,
  experimentDesignAgent] -> roadmapAgent -> assembler -> END`. The three
  middle nodes run in parallel (LangGraph fan-out) and must all complete
  before `roadmapAgent` runs (join).
- Each sub-agent node: reads what it needs from state (at minimum, the
  `prd` for the four downstream nodes), calls `getModel()` from 0001 with a
  node-specific system prompt, and writes its typed output back to state.
  In this TDD's default test suite, the model call is mocked — tests inject
  a fake model/response, not a real API call.
- **Graceful degradation, not exceptions**: if a node's model call fails (or
  in later TDDs, an MCP call fails), the node writes an entry to
  `state.errors` and either produces a degraded output (an explicit "could
  not generate this section" note) or leaves its output field `null` — it
  must never throw and crash the whole graph run. This mirrors the old
  project's MCP failure-handling discipline (`ARCHITECTURE.md` §3),
  generalized to the graph as a whole.

**Out of scope (later TDDs):**
- Postgres checkpointing (0003) — this TDD can use LangGraph's in-memory
  checkpointer for its own tests.
- Real MCP tool calls (0004) — sub-agent nodes in this TDD don't call any
  MCP server yet; that wiring is added in 0004 without changing the graph
  shape established here.
- The streaming route handler and UI (0005).

## Interfaces

```ts
// lib/graph/state.ts
export interface GraphState {
  request: string;
  prd: PrdOutput | null;
  userStories: UserStoryOutput | null;
  architectureReview: ArchitectureReviewOutput | null;
  experimentDesign: ExperimentDesignOutput | null;
  roadmap: RoadmapOutput | null;
  errors: NodeError[];
}

// lib/graph/index.ts
export function buildGraph(): CompiledGraph<GraphState>;
```

## Acceptance criteria (test-first)

- A test asserts the compiled graph's execution order: `prdAgent` completes
  before any of the three fan-out nodes start (assert via mock call-order
  tracking, not timing).
- A test asserts the three fan-out nodes' mocked model calls all receive the
  PRD produced by `prdAgent` in their input — proving the "read from shared
  state" mechanism actually carries the dependency (`ARCHITECTURE.md` §1's
  core claim).
- A test asserts `roadmapAgent` does not run until all three fan-out nodes
  have completed (join behavior).
- A test asserts `assembler` receives all five outputs and produces a single
  merged result.
- A test asserts that when a sub-agent's mocked model call is made to throw,
  the graph run still completes (doesn't crash), `state.errors` contains an
  entry for that node, and the rest of the graph continues where it can
  (e.g. a failed `userStoryAgent` doesn't block `architectureReviewAgent` or
  `experimentDesignAgent`, since they don't depend on it).
- A test asserts a fully-successful mocked run produces state with all five
  output fields populated and an empty `errors` array.

## Notes for the implementing session

- Keep sub-agent system prompts simple and clearly commented for now —
  prompt quality is a later refinement, not what this TDD is testing. The
  acceptance criteria above are about graph *structure*, not output
  *quality*.
- Do not add MCP tool calls in this phase even though it may look like the
  natural next step inside a node — 0004 depends on this graph's node
  boundaries being stable first.
