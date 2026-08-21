import type { StreamEvent } from "../../lib/graph/streamProtocol";
import { ClarificationForm } from "./ClarificationForm";
import type { RunStatus } from "./RunView";

export interface AnsweredQuestions {
  questions: string[];
  answers: string[];
}

export interface ThreadProps {
  status: RunStatus;
  /** The visitor's request text, rendered as the opening user turn. */
  requestText: string;
  events: StreamEvent[];
  /** Questions the run paused on (TDD 0010) — non-empty exactly when `status` is `awaiting-clarification`. */
  questions: string[];
  /** Submits answers for the paused run; required whenever questions can be shown. */
  onAnswer?: (answers: string[]) => void;
  /** The questions and answers from a clarification exchange this run already resolved, rendered as a Q&A turn pair. */
  answeredQuestions: AnsweredQuestions | null;
  fatalError?: string | null;
}

/**
 * Renders a run as a conversational thread (TDD 0014): the visitor's
 * request, the supervisor's routing decision, the clarification exchange if
 * any, and a minimal in-progress status while the run is live. Pure props
 * in, derived from the same status/events/questions state `app/page.tsx`
 * already tracked pre-0014 — no `messages[]` array, since there's one run
 * and a fixed sequence of turns.
 */
function extractSupervisorMessage(events: StreamEvent[]): string | undefined {
  let message: string | undefined;
  for (const event of events) {
    if (event.type === "node-status" && event.node === "supervisor" && event.message) {
      message = event.message;
    }
  }
  return message;
}

export function Thread({
  status,
  requestText,
  events,
  questions,
  onAnswer,
  answeredQuestions,
  fatalError,
}: ThreadProps) {
  if (status === "idle") {
    return (
      <p className="thread-idle" data-testid="thread-idle">
        Describe a product or feature above, or pick an example, to start.
      </p>
    );
  }

  const supervisorMessage = extractSupervisorMessage(events);

  return (
    <div className="thread" data-testid="thread">
      <div className="chat-turn chat-turn-user" data-testid="chat-turn-request">
        <p>{requestText}</p>
      </div>

      {supervisorMessage ? (
        <div className="chat-turn chat-turn-assistant" data-testid="chat-turn-supervisor">
          <p>{supervisorMessage}</p>
        </div>
      ) : null}

      {answeredQuestions ? (
        <>
          <div className="chat-turn chat-turn-assistant" data-testid="chat-turn-questions">
            <ol>
              {answeredQuestions.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ol>
          </div>
          <div className="chat-turn chat-turn-user" data-testid="chat-turn-answers">
            <ul>
              {answeredQuestions.questions.map((question, index) => (
                <li key={question}>{answeredQuestions.answers[index] || "No answer — assumed."}</li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {status === "awaiting-clarification" && questions.length > 0 && onAnswer ? (
        <div className="chat-turn chat-turn-assistant" data-testid="chat-turn-clarification">
          <ClarificationForm questions={questions} onSubmit={onAnswer} />
        </div>
      ) : null}

      {status === "running" ? (
        <p className="chat-status" data-testid="chat-status-working" aria-live="polite">
          Working on it…
        </p>
      ) : null}

      {status === "error" ? (
        <p className="banner banner-error" role="alert" data-testid="run-fatal-error">
          Something went wrong{fatalError ? `: ${fatalError}` : "."}
        </p>
      ) : null}
    </div>
  );
}
