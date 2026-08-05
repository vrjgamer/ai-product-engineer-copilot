"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import type { AssembledResult } from "../lib/graph/state";
import type { StreamEvent } from "../lib/graph/streamProtocol";
import { parseProgressStream } from "../lib/client/parseProgressStream";
import { RunView, type RunStatus } from "./generate/RunView";

const EXAMPLE_PROMPTS = [
  "A mobile app that helps roommates split and track shared utility bills fairly",
  "An internal tool for support agents to triage and route incoming tickets",
  "A browser extension that summarizes long GitHub pull request diffs",
];

export default function Home() {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<RunStatus>("idle");
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [result, setResult] = useState<AssembledResult | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  async function run(requestText: string) {
    setStatus("running");
    setEvents([]);
    setResult(null);
    setFatalError(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: requestText }),
      });
      if (!response.ok || !response.body) {
        throw new Error(`Request failed (${response.status})`);
      }

      for await (const event of parseProgressStream(response.body)) {
        if (event.type === "result") {
          setResult(event.result);
        } else if (event.type === "fatal-error") {
          setFatalError(event.message);
        } else {
          setEvents((prev) => [...prev, event]);
        }
      }

      setStatus((current) => (current === "running" ? "done" : current));
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : String(error));
      setStatus("error");
    }
  }

  function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (input.trim() && status !== "running") void run(input.trim());
  }

  function handleExampleClick(prompt: string) {
    if (status === "running") return;
    setInput(prompt);
    void run(prompt);
  }

  return (
    <main>
      <h1>AI Product Engineer Copilot</h1>
      <p>Describe the product or feature you want a plan for.</p>

      <form onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(changeEvent) => setInput(changeEvent.target.value)}
          placeholder="Describe the product or feature you want a plan for"
          rows={4}
        />
        <button type="submit" disabled={status === "running" || !input.trim()}>
          {status === "running" ? "Generating…" : "Generate plan"}
        </button>
      </form>

      <div>
        <span>Or try an example: </span>
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={status === "running"}
            onClick={() => handleExampleClick(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      <RunView status={status} events={events} result={result} fatalError={fatalError} />
    </main>
  );
}
