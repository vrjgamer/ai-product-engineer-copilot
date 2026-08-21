import Link from "next/link";

/**
 * TDD 0013: today a bad `/run/[runId]` UUID renders inside its own page
 * (see `app/run/[runId]/page.tsx` — that's a deliberate empty state, not a
 * 404), but any *unmatched route* fell through to Next's default 404,
 * styled like no other part of this app. Deliberately plain, using existing
 * tokens — 0014 owns the real redesign.
 */
export default function NotFound() {
  return (
    <main className="page">
      <p className="empty-state" data-testid="not-found">
        Nothing here. The page you&apos;re looking for doesn&apos;t exist.
        <br />
        <Link href="/">Back to the demo</Link>
      </p>
    </main>
  );
}
