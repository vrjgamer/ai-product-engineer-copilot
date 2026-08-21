"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import type { AssembledResult } from "../lib/graph/state";
import type { StreamEvent } from "../lib/graph/streamProtocol";
import { parseProgressStream } from "../lib/client/parseProgressStream";
import { RunView, type RunStatus } from "./generate/RunView";
import type { AnsweredQuestions } from "./generate/Thread";
import { RateLimitNote } from "./RateLimitNote";
import { WhatsNextNote } from "./WhatsNextNote";

const EXAMPLE_PROMPTS = [
  "A mobile app that helps roommates split and track shared utility bills fairly",
  "An internal tool for support agents to triage and route incoming tickets",
  "A browser extension that summarizes long GitHub pull request diffs",
];

export default function Home() {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<RunStatus>("idle");
  const [requestText, setRequestText] = useState("");
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [result, setResult] = useState<AssembledResult | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answeredQuestions, setAnsweredQuestions] = useState<AnsweredQuestions | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [rateLimitMessage, setRateLimitMessage] = useState<string | null>(null);

  const busy = status === "running";

  /**
   * Consumes one leg of a run's SSE stream (TDD 0005), which can end three
   * ways: a result, a fatal error, or — since TDD 0010 — a pause with
   * questions, which leaves the accumulated progress events on screen and
   * hands off to `answer()` below.
   */
  async function consume(body: ReadableStream<Uint8Array>) {
    let paused = false;

    for await (const event of parseProgressStream(body)) {
      if (event.type === "result") {
        setResult(event.result);
        setRunId(event.runId);
      } else if (event.type === "clarification-request") {
        paused = true;
        setRunId(event.runId);
        setQuestions(event.questions);
      } else if (event.type === "fatal-error") {
        setFatalError(event.message);
      } else {
        setEvents((prev) => [...prev, event]);
      }
    }

    setStatus((current) =>
      current !== "running" ? current : paused ? "awaiting-clarification" : "done",
    );
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
    setResult(null);
    setRunId(null);
    setQuestions([]);
    setAnsweredQuestions(null);
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

  function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (input.trim() && !busy) run(input.trim());
  }

  function handleExampleClick(prompt: string) {
    if (busy) return;
    setInput(prompt);
    run(prompt);
  }

  return (
    <main className="page">
      <header className="hero">
        <h1>AI Product Engineer Copilot</h1>
        <p className="hero-lede">
          Describe the product or feature you want a plan for. A multi-agent graph writes the PRD,
          user stories, architecture review, experiment design, and roadmap.
        </p>
        <RateLimitNote />
      </header>

      {rateLimitMessage ? (
        <p className="banner" role="alert" data-testid="rate-limit-banner">
          {rateLimitMessage}
        </p>
      ) : null}

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

      <RunView
        status={status}
        requestText={requestText}
        events={events}
        result={result}
        fatalError={fatalError}
        runId={runId}
        questions={questions}
        onAnswer={answer}
        answeredQuestions={answeredQuestions}
      />

      <WhatsNextNote />
    </main>
  );
}
