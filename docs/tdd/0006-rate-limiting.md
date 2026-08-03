# TDD 0006 — Rate Limiting

**Depends on:** 0003 (Postgres/migrations), 0005 (the route handler this
sits in front of).
**Unblocks:** nothing downstream — this can land any time after 0005.

## Context

`ARCHITECTURE.md` §6: every layer of this stack is on a free tier, so
volume — not per-run cost — is the real exposure. This phase adds a simple
IP-based limiter, and treats the visitor as a stakeholder: the limit is
communicated proactively on the page and gracefully when it's hit, not
silently enforced.

## Scope

**In scope:**
- A `rate_limits` table (e.g. `ip_hash`, `window_start`, `count`) via its
  own migration on top of 0003's migration tooling.
- **IP hashing, not raw storage**: hash the visitor's IP (with a server-side
  salt) before writing it — never persist raw IPs.
- A check at the top of `app/api/generate/route.ts` (from 0005): if the
  requesting IP has exceeded the configured limit (env var, default 5
  runs/hour) within the current window, return a `429` **before** invoking
  the graph — no partial run, no wasted model/MCP calls.
- The `429` response body carries a clear, human-readable message and a
  retry-after indication (e.g. "Demo rate limit reached — try again in N
  minutes"), not a bare status code.
- UI (extends 0005's page): a visible, standing note on the demo page
  stating the limit and the model in use (e.g. "This public demo is limited
  to 5 runs/hour per visitor and uses Claude Haiku 4.5 to keep it
  sustainable on a free-tier deployment.") — proactive, not just reactive.
- UI handling of a `429` response: a friendly banner/toast using the
  message from the response body, not a generic error state.

**Out of scope:**
- Bot detection, CAPTCHA, or authentication — IP-based limiting only, which
  is an accepted, documented limitation given the demo's scope
  (`ARCHITECTURE.md` §6 doesn't claim this is abuse-proof, only that it
  protects against ordinary traffic spikes exhausting free-tier budgets).

## Interfaces

```ts
// lib/rate-limit/check.ts
export async function checkRateLimit(ipHash: string): Promise<
  { allowed: true } | { allowed: false; retryAfterSeconds: number }
>;
```

## Acceptance criteria (test-first)

- A unit test asserts a fresh IP (no prior rows) is allowed.
- A unit test asserts an IP at the configured limit within the current
  window is rejected, with a correct `retryAfterSeconds`.
- A unit test asserts the count resets once the window has elapsed (mock
  time, don't sleep in tests).
- A unit test asserts IPs are never stored raw — only the hashed value ever
  reaches the DB write call (assert on the mocked DB client's received
  arguments).
- A test on the route handler (from 0005) asserts a rejected request never
  invokes the graph (no wasted model/MCP calls on a rate-limited request).
- A component test asserts the UI renders the proactive limit/model note on
  the page, and renders the friendly message (not a generic error) when a
  `429` with a message body is received.

## Notes for the implementing session

- Keep the limit itself configurable via env var rather than hardcoded —
  it's reasonable to tune the number after observing real demo traffic
  without a code change.
