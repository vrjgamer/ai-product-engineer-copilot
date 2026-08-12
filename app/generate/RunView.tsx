import type { AssembledResult } from "../../lib/graph/state";
import type { StreamEvent } from "../../lib/graph/streamProtocol";
import { ClarificationForm } from "./ClarificationForm";
import { ProgressLog } from "./ProgressLog";
import { ResultView } from "./ResultView";

export type RunStatus = "idle" | "running" | "awaiting-clarification" | "done" | "error";

export interface RunViewProps {
  status: RunStatus;
  events: StreamEvent[];
  result: AssembledResult | null;
  fatalError?: string | null;
  /** The completed run's ID (TDD 0007), used to link to `/trace/[runId]`. `null`/omitted before a result has arrived. */
  runId?: string | null;
  /** Questions the run paused on (TDD 0010) — non-empty exactly when `status` is `awaiting-clarification`. */
  questions?: string[];
  /** Submits answers for the paused run; required whenever questions can be shown. */
  onAnswer?: (answers: string[]) => void;
}

/**
 * The states this app's single run can be in: idle (nothing submitted yet),
 * running (live progress, no result yet), awaiting-clarification (TDD 0010 —
 * paused at a durable checkpoint with questions on screen), done (final
 * five-section output, possibly with degraded sections), and error (the run
 * itself never produced a result). Pure props in, no fetch of its own — the
 * orchestrator in `app/page.tsx` owns the network calls, for both the
 * initial run and the resume, and feeds this component the accumulated
 * events.
 */
export function RunView({ status, events, result, fatalError, runId, questions = [], onAnswer }: RunViewProps) {
  if (status === "idle") {
    return (
      <p className="run-idle" data-testid="run-idle">
        Describe a product or feature above, or pick an example, to see a run.
      </p>
    );
  }

  return (
    <div className="run" data-testid="run-view">
      <ProgressLog events={events} live={status === "running"} />
      {status === "awaiting-clarification" && questions.length > 0 && onAnswer ? (
        <ClarificationForm questions={questions} onSubmit={onAnswer} />
      ) : null}
      {status === "error" ? (
        <p className="banner banner-error" role="alert" data-testid="run-fatal-error">
          Something went wrong{fatalError ? `: ${fatalError}` : "."}
        </p>
      ) : null}
      {status === "done" && result ? (
        <>
          {runId ? (
            <a className="trace-link" data-testid="view-trace-link" href={`/trace/${runId}`}>
              View trace →
            </a>
          ) : null}
          <ResultView result={result} />
        </>
      ) : null}
    </div>
  );
}
