# TDD 0009 — Future Work Documentation

**Depends on:** 0001-0008 substantially complete (this is a documentation
consistency pass over the actually-shipped system, not a standalone
technical phase).
**Unblocks:** nothing — this is the closing phase of the initial build.

## Context

`ARCHITECTURE.md` §9 and `VISION.md` describe two deliberately deferred
capabilities — clarifying-question/interrupt support and the full eval/rigor
layer — as part of the *plan*, written before any of 0001-0008 existed. This
phase is a docs-only pass, after the system is actually built, to make sure
those documents (and a short in-product note) still accurately describe what
was built and what's genuinely still deferred — not what was originally
planned before implementation reality may have shifted details.

## Scope

**In scope:**
- Re-read `ARCHITECTURE.md` and `VISION.md` against the actually-implemented
  system from 0001-0008. Update anything that drifted during
  implementation (e.g. a table name, an env var, a detail of the graph
  shape that changed for a good reason during 0002) — this is a fidelity
  pass, not a rewrite of the decisions themselves.
- Confirm `ARCHITECTURE.md` §9 ("Future Work") still accurately describes
  the two deferred capabilities in terms that match the system as built
  (e.g. if 0003's checkpointer implementation has specifics relevant to how
  interrupt/resume would actually be added later, note them).
- Add a small, visible "what's next" note in the demo UI itself (extending
  0005's page) — a short, honest line for a visitor pointing at the same
  two deferred capabilities, in plain language (not a copy-paste of the
  architecture doc's technical framing). This is the one piece of *product*
  surface this phase touches; everything else is docs.
- A final pass on `README.md`'s status section — once 0001-0008 are done,
  the "Current status: planning stage" framing from the initial README
  rewrite is no longer accurate and should describe the shipped system
  instead.

**Out of scope:**
- Implementing either deferred capability — this phase documents them more
  accurately, it doesn't build them.
- Any other code changes beyond the one small UI note described above.

## Acceptance criteria

- `ARCHITECTURE.md`, `VISION.md`, and `README.md` are internally consistent
  with each other and with the actually-shipped code (spot-check: every
  file path, table name, and env var mentioned in these docs exists in the
  codebase as described).
- The demo UI includes a visible, honestly-worded note about what's
  deliberately not built yet.
- No application code changes beyond the UI note above.

## Notes for the implementing session

- This phase exists because a plan written before any code exists will
  always drift somewhat from what actually gets built — closing that gap
  explicitly, rather than leaving the original planning documents stale, is
  itself part of the "honest scoping" quality this project is trying to
  demonstrate (see `VISION.md`).
