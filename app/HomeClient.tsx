"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

import type { StreamEvent } from "../lib/graph/streamProtocol";
import { parseProgressStream } from "../lib/client/parseProgressStream";
import type { RunSummary } from "../lib/results/record";
import { RunView, type RunStatus } from "./generate/RunView";
import type { AnsweredQuestions } from "./generate/Thread";
import { RateLimitNote } from "./RateLimitNote";
import { RecentRunsSidebar } from "./RecentRunsSidebar";
import { ThemeToggle } from "./theme/ThemeToggle";
import { WhatsNextNote } from "./WhatsNextNote";

const EXAMPLE_PROMPTS = [
  "A mobile app that helps roommates split and track shared utility bills fairly",
  "An internal tool for support agents to triage and route incoming tickets",
  "A browser extension that summarizes long GitHub pull request diffs",
];

export interface HomeClientProps {
  /** The last 30 runs (TDD 0012's sidebar reversal), fetched server-side by `app/page.tsx`. */
  recentRuns?: RunSummary[];
}

/** The whole landing page: `app/page.tsx` fetches the recent-runs list server-side, this owns everything interactive — including hiding that sidebar once a run is in progress, since it doesn't have anything to do with the run at hand. */
export default function HomeClient({ recentRuns = [] }: HomeClientProps) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<RunStatus>("idle");
  const [requestText, setRequestText] = useState("");
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answeredQuestions, setAnsweredQuestions] = useState<AnsweredQuestions | null>(null);
  const [prdDraft, setPrdDraft] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);

  const busy = status === "running";

  /**
   * Consumes one leg of a run's SSE stream (TDD 0005), which can end several
   * ways: a result, a fatal error, a pause with clarifying questions (TDD
   * 0010), or a pause for PRD approval — which leaves the accumulated
   * progress events on screen and hands off to `answer()`/
   * `resolvePrdApproval()` below. A result navigates straight to its
   * permalink rather than rendering inline here — the live page's job ends
   * once the run has something durable to show.
   */
  async function consume(body: ReadableStream<Uint8Array>) {
    let pause: "clarification" | "prd-approval" | null = null;

    for await (const event of parseProgressStream(body)) {
      if (event.type === "result") {
        router.push(`/run/${event.runId}`);
        return;
      } else if (event.type === "clarification-request") {
        pause = "clarification";
        setRunId(event.runId);
        setQuestions(event.questions);
      } else if (event.type === "prd-approval-request") {
        pause = "prd-approval";
        setRunId(event.runId);
        setPrdDraft(event.prd);
      } else if (event.type === "fatal-error") {
        setFatalError(event.message);
      } else {
        setEvents((prev) => [...prev, event]);
      }
    }

    setStatus((current) => {
      if (current !== "running") return current;
      if (pause === "clarification") return "awaiting-clarification";
      if (pause === "prd-approval") return "awaiting-prd-approval";
      return "done";
    });
  }

  async function post(payload: Record<string, unknown>) {
    setStatus("running");
    setFatalError(null);
    setRateLimitMessage(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.status === 429) {
        // TDD 0006: a friendly banner using the route's message, not the
        // generic fatal-error state below.
        const errorBody = await response.json().catch(() => null);
        setRateLimitMessage(
          typeof errorBody?.error === "string"
            ? errorBody.error
            : "Demo rate limit reached — try again later.",
        );
        setStatus("idle");
        return;
      }

      if (!response.ok || !response.body) {
        throw new Error(`Request failed (${response.status})`);
      }

      await consume(response.body);
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : String(error));
      setStatus("error");
    }
  }

  function run(text: string) {
    setRequestText(text);
    setEvents([]);
    setRunId(null);
    setQuestions([]);
    setAnsweredQuestions(null);
    setPrdDraft(null);
    void post({ input: text });
  }

  /**
   * Resumes the paused run. Deliberately keeps `events` — the supervisor's
   * decision and everything before the pause are part of the same run, and
   * clearing them would make the graph look like it restarted. Records the
   * exchange in `answeredQuestions` (TDD 0014) so the thread can render it
   * as a Q&A turn pair once `questions` is cleared.
   */
  function answer(answers: string[]) {
    if (!runId) return;
    setAnsweredQuestions({ questions, answers });
    setQuestions([]);
    void post({ runId, answers });
  }

  /**
   * Resolves the PRD-approval pause: approving continues to the fan-out,
   * feedback sends the run back to `prdAgent` for a revised draft — which
   * pauses here again with the new `prdDraft`, so no extra "revising…"
   * state is needed beyond clearing the current one.
   */
  function resolvePrdApproval(approved: boolean, feedback?: string) {
    if (!runId) return;
    setPrdDraft(null);
    void post({ runId, prdApproval: feedback ? { approved, feedback } : { approved } });
  }

  function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (input.trim() && !busy) run(input.trim());
  }

  function handleExampleClick(prompt: string) {
    if (busy) return;
    setInput(prompt);
    run(prompt);
  }

  const idle = status === "idle";

  return (
    <div className="home-shell">
      {idle ? <RecentRunsSidebar runs={recentRuns} /> : null}
      <main className="page">
        <div className="brand-row">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true" />
            <span className="brand-name">AI Product Engineer Copilot</span>
          </div>
          <ThemeToggle />
        </div>

        {rateLimitMessage ? (
          <p className="banner" role="alert" data-testid="rate-limit-banner">
            {rateLimitMessage}
          </p>
        ) : null}

        {/*
          Landing (composer, examples, the deferred-capabilities note) is the
          only thing on screen until a run starts — once it does, this whole
          block disappears rather than lingering above the thread. A finished
          run navigates to its own permalink instead of returning here, so
          there's no "complete" state to design for below.
        */}
        {idle ? (
          <>
            <header className="hero">
              <h1>AI Product Engineer Copilot</h1>
              <p className="hero-lede">
                Describe the product or feature you want a plan for. A multi-agent graph writes the PRD,
                user stories, architecture review, experiment design, and roadmap.
              </p>
              <RateLimitNote />
            </header>

            <form className="card composer" onSubmit={handleSubmit}>
              <textarea
                value={input}
                onChange={(changeEvent) => setInput(changeEvent.target.value)}
                placeholder="Describe the product or feature you want a plan for"
                rows={4}
              />
              <div className="composer-actions">
                <button className="btn-primary" type="submit" disabled={busy || !input.trim()}>
                  {busy ? "Generating…" : "Generate plan"}
                </button>
              </div>
            </form>

            <div className="examples">
              <span className="examples-label">Or try an example: </span>
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  className="chip"
                  type="button"
                  disabled={busy}
                  onClick={() => handleExampleClick(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <WhatsNextNote />
          </>
        ) : (
          <RunView
            status={status}
            requestText={requestText}
            events={events}
            result={null}
            fatalError={fatalError}
            runId={runId}
            questions={questions}
            onAnswer={answer}
            answeredQuestions={answeredQuestions}
            prdDraft={prdDraft}
            onResolvePrdApproval={resolvePrdApproval}
          />
        )}
      </main>
    </div>
  );
}
