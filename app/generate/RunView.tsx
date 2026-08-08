import type { AssembledResult } from "../../lib/graph/state";
import type { StreamEvent } from "../../lib/graph/streamProtocol";
import { ProgressLog } from "./ProgressLog";
import { ResultView } from "./ResultView";

export type RunStatus = "idle" | "running" | "done" | "error";

export interface RunViewProps {
  status: RunStatus;
  events: StreamEvent[];
  result: AssembledResult | null;
  fatalError?: string | null;
}

/**
 * The four states this app's single run can be in (TDD 0005): idle (nothing
 * submitted yet), running (live progress, no result yet), done (final
 * five-section output, possibly with degraded sections), and error (the run
 * itself never produced a result). Pure props in, no fetch of its own — the
 * orchestrator in `app/page.tsx` owns the network call and feeds this
 * component the accumulated events.
 */
export function RunView({ status, events, result, fatalError }: RunViewProps) {
  if (status === "idle") {
    return (
      <p data-testid="run-idle">
        Describe a product or feature above, or pick an example, to see a run.
      </p>
    );
  }

  return (
    <div data-testid="run-view">
      <ProgressLog events={events} live={status === "running"} />
      {status === "error" ? (
        <p role="alert" data-testid="run-fatal-error">
          Something went wrong{fatalError ? `: ${fatalError}` : "."}
        </p>
      ) : null}
      {status === "done" && result ? <ResultView result={result} /> : null}
    </div>
  );
}
