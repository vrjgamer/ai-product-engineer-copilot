# Adversarial review checklist

Expanded version of the categories in SKILL.md. Read this when you want
concrete prompts for a category rather than just the one-line summary — not
every item applies to every PR; use judgment about what's relevant to the
actual diff.

## Correctness

- Off-by-one errors at loop bounds, array indices, pagination cursors.
- Boundary values: empty collection, zero, negative numbers, max int/float,
  duplicate entries, unicode/emoji in strings assumed ASCII.
- Inverted or subtly wrong conditionals (`&&` vs `||`, `<` vs `<=`).
- State assumed to exist that might not (first run, empty database, cold
  cache, missing optional field from an upstream API).
- Type coercion surprises (falsy-but-valid values like `0` or `""` treated
  as absent).
- Does the change actually do what the PR description claims, or does the
  description overstate/understate the real behavior?

## Security

- Unvalidated or unsanitized external input reaching a shell command, SQL
  query, file path, template, or HTML output.
- Auth/authz: does a check that used to run still run after the refactor?
  Is an authorization check comparing the right identity?
- Secrets, tokens, or credentials logged, committed, or included in error
  messages/stack traces returned to a client.
- SSRF: does the change let a caller supply a URL/host that the server then
  fetches?
- Path traversal: does the change let a caller influence a filesystem path?
- Deserialization of untrusted data.
- Dependency changes: new packages with broad permissions, or a version
  bump that silently changes security-relevant defaults.

## Concurrency & resources

- Race conditions: two requests/processes touching the same state without
  a lock, transaction, or atomic operation.
- Unhandled promise rejections / unawaited async calls.
- Unbounded loops, recursion, or memory growth (unpaginated fetch-all,
  accumulating an array with no cap).
- Resources opened (file handles, DB connections, network sockets) without
  a guaranteed close/release path, including on the error path.
- Retry logic without backoff or a cap, risking amplification under load.

## Error handling

- Caught exceptions that are swallowed silently (empty catch block, logged
  but not surfaced, or surfaced as a generic message that hides the cause).
- The wrong error propagated to the caller (a 500 for what should be a 400,
  or vice versa).
- Partial failure: a multi-step operation that can fail halfway through and
  leave data in an inconsistent state, with no rollback or compensation.
- Error paths that are never exercised by any test.

## Test quality

- Tests that assert on something trivial (e.g. "function didn't throw")
  instead of the actual behavior being changed.
- Tests that mock out exactly the logic the PR changed, so they'd pass
  even if that logic were wrong.
- Changed or new behavior with no corresponding new/updated test at all.
- Snapshot tests updated to match new output without anyone verifying the
  new output is actually correct.
- Flaky-looking tests (timing-dependent, order-dependent, relying on
  external network/state) introduced or left unaddressed.

## Design & scope

- Abstraction introduced for a hypothetical future need with no current
  second caller.
- Backwards-compatibility shims, feature flags, or dual code paths kept
  around for compatibility nobody has actually asked for.
- Scope creep: changes unrelated to what the PR description says it does,
  bundled into the same diff, making it harder to review or revert either
  part independently.
- A decision that contradicts something the repo's own docs (README,
  ARCHITECTURE.md, CLAUDE.md, ADRs) explicitly say the project does or
  intentionally avoids.
- Comments explaining *what* the code does (redundant with the code) rather
  than *why* a non-obvious choice was made.
