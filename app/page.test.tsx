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
    expect(screen.getByTestId("whats-next-note").textContent).toContain("clarifying question");
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
});
