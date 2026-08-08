/**
 * TDD 0006 / ARCHITECTURE.md §6: the demo page states the rate limit and
 * model in use proactively, not just when a visitor hits it. Static copy —
 * the actual enforced limit lives server-side (`RATE_LIMIT_MAX_RUNS_PER_HOUR`
 * in `lib/rate-limit/check.ts`); this text is expected to be kept in sync
 * with that default rather than read from it at request time.
 */
export function RateLimitNote() {
  return (
    <p data-testid="rate-limit-note">
      This public demo is limited to 5 runs/hour per visitor and uses Claude Haiku 4.5 to
      keep it sustainable on a free-tier deployment.
    </p>
  );
}
