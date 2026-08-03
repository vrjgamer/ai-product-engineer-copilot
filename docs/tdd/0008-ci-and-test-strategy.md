# TDD 0008 — CI and Test Strategy

**Depends on:** all prior TDDs' test suites existing (this phase wires up
CI over what's already there — it doesn't gate on every prior phase being
fully complete, but is most meaningful once the mocked suite has real
coverage from 0001-0007).
**Unblocks:** nothing downstream — this is the "make what already exists
run automatically" phase.

## Context

`ARCHITECTURE.md` §8: the default suite is fully mocked and requires no API
keys (matching the old project's actual discipline); a separate,
manually-invoked suite exercises the real Haiku 4.5 model and the real
GitHub MCP integration. This phase formalizes that split and adds the CI
workflow the old repo never had at all.

## Scope

**In scope:**
- `.github/workflows/ci.yml`: on every push/PR, run `npm ci`, `npm run
  typecheck`, `npm run lint`, `npm test` (the default mocked suite only).
  No secrets required for this workflow to pass.
- A separate `npm run test:e2e` script (or equivalent) that runs the
  real-API integration tests from prior TDDs (0003's checkpoint-resume
  test, 0004's real MCP calls, 0005's real end-to-end run) — **not** wired
  into the CI workflow above. Documented in `README.md` as a manual command
  requiring real env vars (`DATABASE_URL`, `ANTHROPIC_API_KEY` or the
  active provider's key, `GITHUB_TOKEN`).
- `.env.example` (extending 0001's version) covering every env var
  introduced across 0001-0007, so a developer running the real-API suite
  locally has one place to look.
- No auto-deploy step in the workflow — Vercel's own GitHub integration
  already handles preview/production deploys on push, and duplicating that
  in Actions would be redundant infrastructure.

**Out of scope:**
- Running `test:e2e` in CI, even on a schedule or on merge to main — this
  was a deliberate scope decision (`ARCHITECTURE.md` §8) to avoid managing
  secrets and ongoing API spend in CI for a demo project. If real-API CI
  coverage is wanted later, it's a clearly separable addition, not
  something this phase needs to anticipate.

## Interfaces

```yaml
# .github/workflows/ci.yml (shape, not literal content)
on: [push, pull_request]
jobs:
  test:
    steps:
      - checkout
      - setup-node
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
```

## Acceptance criteria

- The CI workflow YAML is valid and, run against a clean checkout with no
  secrets configured, passes (proving the default suite genuinely needs no
  API keys, matching the stated discipline).
- `npm run test:e2e` is documented in `README.md` with the exact env vars
  it requires and a one-line description of what it actually calls (real
  model, real MCP, real Postgres) so a reviewer understands why it isn't in
  CI.
- `.env.example` is complete and accurate against every env var actually
  read by the codebase at this point (a quick grep for `process.env.` cross
  -checked against the file is sufficient verification — no need for
  tooling to enforce this).

## Notes for the implementing session

- This phase is intentionally "wire up what already exists," not "write new
  tests" — if a prior TDD's acceptance criteria weren't actually
  implemented as tests, that's a gap in that TDD's phase, not something to
  backfill here as a side effect of writing CI config.
