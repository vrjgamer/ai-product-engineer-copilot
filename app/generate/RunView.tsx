"use client";

import type { ProgressEvent } from "../../lib/graph/progress";
import type { AssembledResult } from "../../lib/graph/state";
import type { StreamEvent } from "../../lib/graph/streamProtocol";
import { LiveGraphPanel } from "./LiveGraphPanel";
import type { AnsweredQuestions } from "./Thread";
import { Thread } from "./Thread";
import { WorkspacePanel } from "./WorkspacePanel";

function isProgressEvent(event: StreamEvent): event is ProgressEvent {
  return event.type === "node-status" || event.type === "mcp-call";
}

export type RunStatus =
  | "idle"
  | "running"
  | "awaiting-clarification"
  | "awaiting-prd-approval"
  | "done"
  | "error";

export interface RunViewProps {
  status: RunStatus;
  /** The visitor's request text, rendered as the thread's opening user turn. */
  requestText: string;
  events: StreamEvent[];
  result: AssembledResult | null;
  fatalError?: string | null;
  /** The completed run's ID (TDD 0007), used to link to `/trace/[runId]`. `null`/omitted before a result has arrived. */
  runId?: string | null;
  /** Questions the run paused on (TDD 0010) — non-empty exactly when `status` is `awaiting-clarification`. */
  questions?: string[];
  /** Submits answers for the paused run; required whenever questions can be shown. */
  onAnswer?: (answers: string[]) => void;
  /** The questions and answers from a clarification exchange this run already resolved (TDD 0014), rendered as a Q&A turn pair. */
  answeredQuestions?: AnsweredQuestions | null;
  /** The drafted PRD awaiting approval — set exactly when `status` is `awaiting-prd-approval`. */
  prdDraft?: string | null;
  /** Approves the drafted PRD (continues to the fan-out) or sends it back with feedback (loops to a revised draft). */
  onResolvePrdApproval?: (approved: boolean, feedback?: string) => void;
}

/**
 * The chat-style layout this app's single run renders into: the thread,
 * then the workspace panel, stacked full-width — the same single-column
 * shape `/run/[runId]` uses, rather than a two-pane split with its own
 * responsive breakpoint. Pure props in, no fetch of its own — the
 * orchestrator in `app/page.tsx` owns the network calls and feeds this
 * component the accumulated events.
 */
export function RunView({
  status,
  requestText,
  events,
  result,
  fatalError,
  runId,
  questions = [],
  onAnswer,
  answeredQuestions = null,
  prdDraft = null,
  onResolvePrdApproval,
}: RunViewProps) {
  if (status === "idle") {
    return (
      <Thread
        status="idle"
        requestText={requestText}
        events={events}
        questions={questions}
        answeredQuestions={answeredQuestions}
      />
    );
  }

  return (
    <div className="run-stack" data-testid="run-view">
      <Thread
        status={status}
        requestText={requestText}
        events={events}
        questions={questions}
        onAnswer={onAnswer}
        answeredQuestions={answeredQuestions}
        fatalError={fatalError}
        prdDraft={prdDraft}
        onResolvePrdApproval={onResolvePrdApproval}
      />

      <WorkspacePanel
        status={status}
        result={result}
        runId={runId}
        graph={<LiveGraphPanel events={events.filter(isProgressEvent)} aborted={status === "error"} />}
      />
    </div>
  );
}
