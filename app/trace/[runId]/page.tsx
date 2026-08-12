import { getRunEval } from "../../../lib/eval/record";
import { getRunTrace } from "../../../lib/tracing/record";
import { TraceView } from "../TraceView";

interface TracePageProps {
  params: Promise<{ runId: string }>;
}

/** The "view trace" link's destination (TDD 0007) — server-rendered, fetches the trace row directly rather than round-tripping through an API route. */
export default async function TracePage({ params }: TracePageProps) {
  const { runId } = await params;
  // Both by run ID, in parallel — a quality judgment (TDD 0011) exists only
  // for the handful of runs the eval harness produced, so this is null for
  // essentially every visitor run.
  const [trace, evaluation] = await Promise.all([getRunTrace(runId), getRunEval(runId)]);

  if (!trace) {
    return (
      <main className="page">
        <p className="empty-state" data-testid="trace-not-found">
          No trace found for run {runId}.
        </p>
      </main>
    );
  }

  return (
    <main className="page">
      <TraceView trace={trace} evaluation={evaluation} />
    </main>
  );
}
