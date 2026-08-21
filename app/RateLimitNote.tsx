/**
 * TDD 0006 / ARCHITECTURE.md §6: the demo page states the rate limit and
 * model in use proactively, not just when a visitor hits it. Static copy —
 * this is a client component (`app/page.tsx`), so it can't read
 * `MODEL_PROVIDER`/`MODEL_ID` server-side at request time; both this text
 * and the enforced limit (`RATE_LIMIT_MAX_RUNS_PER_HOUR` in
 * `lib/rate-limit/check.ts`) are expected to be kept in sync with their
 * actual defaults by hand rather than read from them. See ARCHITECTURE.md
 * §2/§12 for what's actually deployed (Gemini 2.5 Flash, not Claude — TDD
 * 0013's incident was this exact kind of drift going unnoticed).
 */
export function RateLimitNote() {
  return (
    <p className="note" data-testid="rate-limit-note">
      This public demo is limited to 5 runs/hour per visitor and uses Gemini 2.5 Flash to
      keep it sustainable on a free-tier deployment.
    </p>
  );
}
