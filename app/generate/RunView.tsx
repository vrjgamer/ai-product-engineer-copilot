"use client";

import { useState } from "react";

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

export type RunStatus = "idle" | "running" | "awaiting-clarification" | "done" | "error";

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
}

/**
 * The chat-style layout this app's single run renders into (TDD 0014): a
 * conversational thread on the left, and a workspace panel on the right
 * holding the deliverables. Above ~900px they sit side by side (handled in
 * CSS); below, a Chat/Result toggle switches between them, mirroring
 * claude.ai's own mobile behaviour. Pure props in, no fetch of its own — the
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
}: RunViewProps) {
  const [mobileView, setMobileView] = useState<"chat" | "result">("chat");

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
    <div className="layout" data-testid="run-view">
      <div className="mobile-toggle" data-testid="mobile-toggle">
        <button
          className="mobile-toggle-btn"
          type="button"
          data-testid="mobile-toggle-chat"
          aria-pressed={mobileView === "chat"}
          onClick={() => setMobileView("chat")}
        >
          Chat
        </button>
        <button
          className="mobile-toggle-btn"
          type="button"
          data-testid="mobile-toggle-result"
          aria-pressed={mobileView === "result"}
          onClick={() => setMobileView("result")}
        >
          Result
        </button>
      </div>

      <div className="thread-pane" data-testid="thread-pane" data-mobile-hidden={mobileView !== "chat"}>
        <Thread
          status={status}
          requestText={requestText}
          events={events}
          questions={questions}
          onAnswer={onAnswer}
          answeredQuestions={answeredQuestions}
          fatalError={fatalError}
        />
      </div>

      <div
        className="workspace-pane"
        data-testid="workspace-pane"
        data-mobile-hidden={mobileView !== "result"}
      >
        <WorkspacePanel
          status={status}
          result={result}
          runId={runId}
          graph={<LiveGraphPanel events={events.filter(isProgressEvent)} aborted={status === "error"} />}
        />
      </div>
    </div>
  );
}
