import { getRunEval } from "../../../lib/eval/record";
import { getRunResult } from "../../../lib/results/record";
import { getRunTrace } from "../../../lib/tracing/record";
import { StoredRunView } from "../StoredRunView";

interface RunPageProps {
  params: Promise<{ runId: string }>;
}

/**
 * A completed run's permalink (TDD 0012, absorbing the trace page in TDD
 * 0015) — server-rendered, fetching the stored result, trace, and quality
 * judgment directly rather than round-tripping through an API route.
 *
 * The three rows are independent (0012 deliberately has no FK from
 * `run_traces`/`run_evals` to `run_results`), so this only 404s when *none*
 * of them exist — a run with just a trace, or just a result, still renders.
 *
 * Access control is the unguessability of the server-minted UUID, the same
 * property `resumeRun` already relies on; nothing enumerates run IDs and
 * there is no listing route (TDD 0012, "the URL is the capability").
 */
export default async function RunPage({ params }: RunPageProps) {
  const { runId } = await params;
  const [run, trace, evaluation] = await Promise.all([
    getRunResult(runId),
    getRunTrace(runId),
    getRunEval(runId),
  ]);

  if (!run && !trace) {
    return (
      <main className="page">
        <p className="empty-state" data-testid="run-not-found">
          No data found for run {runId}. Runs that failed before either the result or the trace was
          saved won&apos;t have one.
        </p>
      </main>
    );
  }

  return (
    <main className="page">
      <StoredRunView runId={runId} run={run} trace={trace} evaluation={evaluation} />
    </main>
  );
}
