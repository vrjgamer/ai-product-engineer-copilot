// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { StreamEvent } from "../../lib/graph/streamProtocol";
import { Thread } from "./Thread";

afterEach(cleanup);

describe("Thread", () => {
  it("idle: shows a prompt to start a run and no turns", () => {
    render(
      <Thread status="idle" requestText="" events={[]} questions={[]} answeredQuestions={null} />,
    );

    expect(screen.getByTestId("thread-idle")).toBeTruthy();
    expect(screen.queryByTestId("chat-turn-request")).toBeNull();
  });

  it("running: renders the visitor's request as a user turn", () => {
    render(
      <Thread status="running" requestText="A todo app" events={[]} questions={[]} answeredQuestions={null} />,
    );

    expect(screen.getByTestId("chat-turn-request").textContent).toContain("A todo app");
  });

  it("renders the supervisor's routing decision as a short assistant turn once it arrives", () => {
    const events: StreamEvent[] = [
      {
        type: "node-status",
        node: "supervisor",
        status: "running",
        message: "Routing to the PRD agent first — every deliverable depends on it.",
      },
    ];

    render(
      <Thread status="running" requestText="A todo app" events={events} questions={[]} answeredQuestions={null} />,
    );

    expect(screen.getByTestId("chat-turn-supervisor").textContent).toContain("Routing to the PRD agent");
  });

  it("shows no supervisor turn before the supervisor has reported", () => {
    render(
      <Thread status="running" requestText="A todo app" events={[]} questions={[]} answeredQuestions={null} />,
    );

    expect(screen.queryByTestId("chat-turn-supervisor")).toBeNull();
  });

  it("running: shows a minimal working status", () => {
    render(
      <Thread status="running" requestText="A todo app" events={[]} questions={[]} answeredQuestions={null} />,
    );

    expect(screen.getByTestId("chat-status-working")).toBeTruthy();
  });

  it("done: shows no working status", () => {
    render(
      <Thread status="done" requestText="A todo app" events={[]} questions={[]} answeredQuestions={null} />,
    );

    expect(screen.queryByTestId("chat-status-working")).toBeNull();
  });

  it("awaiting-clarification: renders the questions as an assistant turn with the skip button available", () => {
    render(
      <Thread
        status="awaiting-clarification"
        requestText="an app"
        events={[]}
        questions={["Who is this for?"]}
        answeredQuestions={null}
        onAnswer={() => {}}
      />,
    );

    expect(screen.getByTestId("clarification-form").textContent).toContain("Who is this for?");
    expect(screen.getByTestId("clarification-skip")).toBeTruthy();
    expect(screen.queryByTestId("chat-status-working")).toBeNull();
  });

  it("renders answered questions as a Q&A exchange once the run has moved past the pause", () => {
    render(
      <Thread
        status="done"
        requestText="an app"
        events={[]}
        questions={[]}
        answeredQuestions={{ questions: ["Who is this for?"], answers: ["Freelance designers"] }}
      />,
    );

    expect(screen.getByTestId("chat-turn-questions").textContent).toContain("Who is this for?");
    expect(screen.getByTestId("chat-turn-answers").textContent).toContain("Freelance designers");
    expect(screen.queryByTestId("clarification-form")).toBeNull();
  });

  it("marks a skipped answer as assumed rather than showing a blank line", () => {
    render(
      <Thread
        status="done"
        requestText="an app"
        events={[]}
        questions={[]}
        answeredQuestions={{ questions: ["Who is this for?"], answers: [""] }}
      />,
    );

    expect(screen.getByTestId("chat-turn-answers").textContent).toMatch(/assum/i);
  });

  it("error: shows a fatal-error turn instead of a working status", () => {
    render(
      <Thread
        status="error"
        requestText="an app"
        events={[]}
        questions={[]}
        answeredQuestions={null}
        fatalError="checkpointer unreachable"
      />,
    );

    expect(screen.getByTestId("run-fatal-error").textContent).toContain("checkpointer unreachable");
    expect(screen.queryByTestId("chat-status-working")).toBeNull();
  });
});
