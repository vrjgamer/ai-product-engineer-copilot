import type { RunResult } from "../../lib/results/record";
import { ResultView } from "../generate/ResultView";

export interface StoredRunViewProps {
  run: RunResult;
}

/**
 * Renders a stored run's deliverables at its permalink (TDD 0012). Pure props
 * in, no fetch of its own — `app/run/[runId]/page.tsx` owns fetching the row,
 * exactly as the trace page owns fetching the trace for `TraceView`.
 *
 * The deliverables go through the *same* `ResultView` the live run used, so a
 * degraded section (TDD 0002's contract) carries the same warning here that
 * the visitor saw: a shared plan shouldn't look more complete than the run
 * that produced it.
 *
 * The request is shown above them because the deliverables refer to "the
 * product" throughout and never restate it — and the reader of a shared link
 * may not be the person who typed it.
 */
export function StoredRunView({ run }: StoredRunViewProps) {
  return (
    <section className="stored-run" data-testid="stored-run-view">
      <h1 className="section-title">Saved plan</h1>
      <p className="stored-run-request" data-testid="stored-run-request">
        {run.request}
      </p>
      <p className="stored-run-meta" data-testid="stored-run-created-at">
        Generated {run.createdAt}
      </p>
      <a className="trace-link" data-testid="view-trace-link" href={`/trace/${run.runId}`}>
        View trace →
      </a>
      <ResultView result={run.result} />
    </section>
  );
}
