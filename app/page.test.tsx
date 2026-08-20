// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StreamEvent } from "../lib/graph/streamProtocol";
import Home from "./page";

afterEach(cleanup);

/** Builds an SSE body in the same `data-progress` wire format app/api/generate/route.ts streams. */
function sseBody(events: StreamEvent[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const text = events
    .map((event) => `data: ${JSON.stringify({ type: "data-progress", data: event })}\n\n`)
    .join("");
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

describe("Home page", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("shows the proactive rate-limit/model note before any run is started", () => {
    render(<Home />);

    expect(fetchMock).not.toHaveBeenCalled();
    const text = screen.getByTestId("rate-limit-note").textContent;
    expect(text).toContain("5 runs/hour");
    expect(text).toContain("Claude Haiku 4.5");
  });

  it("shows the deferred-capabilities note without needing a run (TDD 0009)", () => {
    render(<Home />);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("whats-next-note").textContent).toMatch(/scor|grad|eval/i);
  });

  it("shows the friendly rate-limit message from a 429 response instead of the generic error state", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: "Demo rate limit reached — try again in 12 minutes.", retryAfterSeconds: 720 }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
    );

    render(<Home />);
    fireEvent.change(screen.getByPlaceholderText("Describe the product or feature you want a plan for"), {
      target: { value: "Build a todo app" },
    });
    fireEvent.click(screen.getByText("Generate plan"));

    await waitFor(() => {
      expect(screen.getByTestId("rate-limit-banner").textContent).toContain(
        "Demo rate limit reached — try again in 12 minutes.",
      );
    });

    expect(screen.queryByTestId("run-fatal-error")).toBeNull();
  });

  it("shows the server's explanation for a non-streaming failure rather than a bare status code", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error: "The demo can't reach its database right now, so runs are paused." }),
        { status: 503, headers: { "content-type": "application/json" } },
      ),
    );

    render(<Home />);
    fireEvent.change(screen.getByPlaceholderText("Describe the product or feature you want a plan for"), {
      target: { value: "Build a todo app" },
    });
    fireEvent.click(screen.getByText("Generate plan"));

    await waitFor(() => {
      expect(screen.getByTestId("run-fatal-error").textContent).toContain("can't reach its database");
    });
  });

  it("shows a 'view trace' link pointing at the run id streamed in the result event (TDD 0007)", async () => {
    const result = {
      prd: { content: "PRD content" },
      userStories: { content: "User stories content" },
      architectureReview: { content: "Architecture review content" },
      experimentDesign: { content: "Experiment design content" },
      roadmap: { content: "Roadmap content" },
      errors: [],
    };
    fetchMock.mockResolvedValue(
      new Response(sseBody([{ type: "result", result, runId: "run-abc" }]), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    render(<Home />);
    fireEvent.change(screen.getByPlaceholderText("Describe the product or feature you want a plan for"), {
      target: { value: "Build a todo app" },
    });
    fireEvent.click(screen.getByText("Generate plan"));

    await waitFor(() => {
      expect(screen.getByTestId("view-trace-link").getAttribute("href")).toBe("/trace/run-abc");
    });
  });

  /** TDD 0010: the run pauses, the page asks, the answers go back on the same runId. */
  describe("clarifying questions", () => {
    const RESULT = {
      prd: { content: "PRD content" },
      userStories: { content: "User stories content" },
      architectureReview: { content: "Architecture review content" },
      experimentDesign: { content: "Experiment design content" },
      roadmap: { content: "Roadmap content" },
      errors: [],
    };

    function sseResponse(events: StreamEvent[]): Response {
      return new Response(sseBody(events), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }

    async function startPausedRun() {
      fetchMock.mockResolvedValueOnce(
        sseResponse([
          { type: "node-status", node: "supervisor", status: "completed" },
          { type: "clarification-request", runId: "run-abc", questions: ["Who is this for?"] },
        ]),
      );

      render(<Home />);
      fireEvent.change(screen.getByPlaceholderText("Describe the product or feature you want a plan for"), {
        target: { value: "an app" },
      });
      fireEvent.click(screen.getByText("Generate plan"));

      await waitFor(() => {
        expect(screen.getByTestId("clarification-form")).toBeTruthy();
      });
    }

    it("shows the questions instead of a result when the run pauses", async () => {
      await startPausedRun();

      expect(screen.getByTestId("clarification-form").textContent).toContain("Who is this for?");
      expect(screen.queryByTestId("result-view")).toBeNull();
      // A pause is not an error.
      expect(screen.queryByTestId("run-fatal-error")).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("posts the answers back against the paused run's id and renders the completed result", async () => {
      await startPausedRun();
      fetchMock.mockResolvedValueOnce(
        sseResponse([{ type: "result", result: RESULT, runId: "run-abc" }]),
      );

      const input = screen.getByTestId("clarification-form").querySelector("input")!;
      fireEvent.change(input, { target: { value: "Freelance designers" } });
      fireEvent.submit(screen.getByTestId("clarification-form"));

      await waitFor(() => {
        expect(screen.getByTestId("result-view")).toBeTruthy();
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const secondCall = fetchMock.mock.calls[1] as [string, { body: string }];
      expect(JSON.parse(secondCall[1].body)).toEqual({
        runId: "run-abc",
        answers: ["Freelance designers"],
      });
      expect(screen.getByTestId("view-trace-link").getAttribute("href")).toBe("/trace/run-abc");
      expect(screen.queryByTestId("clarification-form")).toBeNull();
    });

    it("keeps the pre-pause progress on screen through the resume", async () => {
      await startPausedRun();
      fetchMock.mockResolvedValueOnce(
        sseResponse([
          { type: "node-status", node: "prdAgent", status: "completed" },
          { type: "result", result: RESULT, runId: "run-abc" },
        ]),
      );

      fireEvent.click(screen.getByTestId("clarification-skip"));

      await waitFor(() => {
        expect(screen.getByTestId("result-view")).toBeTruthy();
      });

      // Both legs are one run — clearing the earlier events would make the
      // graph look like it restarted from scratch.
      expect(screen.getByTestId("node-status-supervisor").getAttribute("data-status")).toBe("completed");
      expect(screen.getByTestId("node-status-prdAgent").getAttribute("data-status")).toBe("completed");
    });

    it("surfaces a failed resume as the run's error state", async () => {
      await startPausedRun();
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "That run isn't waiting for answers — start a new one." }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
      );

      fireEvent.click(screen.getByTestId("clarification-skip"));

      await waitFor(() => {
        expect(screen.getByTestId("run-fatal-error")).toBeTruthy();
      });
    });
  });
});
