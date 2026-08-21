"use client";

/**
 * TDD 0013: a render throw anywhere under this segment used to fall through
 * to Next's default error page, styled like no other part of this app. This
 * version's `error.tsx` receives `retry` (not `reset`) — see
 * node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md.
 * Deliberately plain, using existing tokens — 0014 owns the real redesign.
 */
export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="page">
      <p className="banner banner-error" data-testid="error-boundary">
        Something went wrong{error.digest ? ` (ref: ${error.digest})` : ""}.{" "}
        {error.message || "An unexpected error occurred."}
      </p>
      <button type="button" className="btn-primary" onClick={() => retry()}>
        Try again
      </button>
    </main>
  );
}
