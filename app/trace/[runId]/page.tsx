import { getRunTrace } from "../../../lib/tracing/record";
import { TraceView } from "../TraceView";

interface TracePageProps {
  params: Promise<{ runId: string }>;
}

/** The "view trace" link's destination (TDD 0007) — server-rendered, fetches the trace row directly rather than round-tripping through an API route. */
export default async function TracePage({ params }: TracePageProps) {
  const { runId } = await params;
  const trace = await getRunTrace(runId);

  if (!trace) {
    return (
      <main>
        <p data-testid="trace-not-found">No trace found for run {runId}.</p>
      </main>
    );
  }

  return (
    <main>
      <TraceView trace={trace} />
    </main>
  );
}
