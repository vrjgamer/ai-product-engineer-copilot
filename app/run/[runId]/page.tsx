import { getRunResult } from "../../../lib/results/record";
import { StoredRunView } from "../StoredRunView";

interface RunPageProps {
  params: Promise<{ runId: string }>;
}

/**
 * A completed run's permalink (TDD 0012) — server-rendered, fetching the
 * stored result directly rather than round-tripping through an API route,
 * the same shape as `app/trace/[runId]/page.tsx`.
 *
 * Access control is the unguessability of the server-minted UUID, the same
 * property `resumeRun` already relies on; nothing enumerates run IDs and
 * there is no listing route (TDD 0012, "the URL is the capability").
 */
export default async function RunPage({ params }: RunPageProps) {
  const { runId } = await params;
  const run = await getRunResult(runId);

  if (!run) {
    return (
      <main className="page">
        <p className="empty-state" data-testid="run-not-found">
          No saved plan found for run {runId}. Runs that failed, are still in progress, or finished
          before results were saved won&apos;t have one.
        </p>
      </main>
    );
  }

  return (
    <main className="page">
      <StoredRunView run={run} />
    </main>
  );
}
