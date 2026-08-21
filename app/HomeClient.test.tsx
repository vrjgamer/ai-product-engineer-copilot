// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StreamEvent } from "../lib/graph/streamProtocol";
import Home from "./HomeClient";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

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
    pushMock.mockClear();
  });

  it("shows the proactive rate-limit/model note before any run is started", () => {
    render(<Home />);

    expect(fetchMock).not.toHaveBeenCalled();
    const text = screen.getByTestId("rate-limit-note").textContent;
    expect(text).toContain("5 runs/hour");
    expect(text).toContain("Gemini 2.5 Flash");
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

  it("navigates to the run's permalink once the result event arrives (TDD 0007/0012)", async () => {
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
      expect(pushMock).toHaveBeenCalledWith("/run/run-abc");
    });
  });

  it("hides the landing composer once a run starts", async () => {
    fetchMock.mockResolvedValue(
      new Response(sseBody([{ type: "node-status", node: "supervisor", status: "running" }]), {
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
      expect(screen.queryByPlaceholderText("Describe the product or feature you want a plan for")).toBeNull();
    });
    expect(screen.queryByTestId("whats-next-note")).toBeNull();
  });

  it("hides the recent-runs sidebar once a run starts, and shows it again on the idle landing page", async () => {
    fetchMock.mockResolvedValue(
      new Response(sseBody([{ type: "node-status", node: "supervisor", status: "running" }]), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    render(<Home recentRuns={[{ runId: "run-1", request: "Build a todo app", createdAt: new Date().toISOString() }]} />);
    expect(screen.getByTestId("recent-runs-sidebar")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Describe the product or feature you want a plan for"), {
      target: { value: "Build a todo app" },
    });
    fireEvent.click(screen.getByText("Generate plan"));

    await waitFor(() => {
      expect(screen.queryByTestId("recent-runs-sidebar")).toBeNull();
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

    it("posts the answers back against the paused run's id and navigates to its permalink", async () => {
      await startPausedRun();
      fetchMock.mockResolvedValueOnce(
        sseResponse([{ type: "result", result: RESULT, runId: "run-abc" }]),
      );

      const input = screen.getByTestId("clarification-form").querySelector("input")!;
      fireEvent.change(input, { target: { value: "Freelance designers" } });
      fireEvent.submit(screen.getByTestId("clarification-form"));

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith("/run/run-abc");
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const secondCall = fetchMock.mock.calls[1] as [string, { body: string }];
      expect(JSON.parse(secondCall[1].body)).toEqual({
        runId: "run-abc",
        answers: ["Freelance designers"],
      });
      expect(screen.queryByTestId("clarification-form")).toBeNull();
    });

    it("keeps the pre-pause exchange on screen through the resume, as part of the same thread", async () => {
      await startPausedRun();
      fetchMock.mockResolvedValueOnce(
        sseResponse([
          { type: "node-status", node: "prdAgent", status: "completed" },
          { type: "result", result: RESULT, runId: "run-abc" },
        ]),
      );

      fireEvent.click(screen.getByTestId("clarification-skip"));

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith("/run/run-abc");
      });

      // Both legs are one run — the questions the run paused on stay
      // visible as a resolved Q&A turn rather than disappearing.
      expect(screen.getByTestId("chat-turn-questions").textContent).toContain("Who is this for?");
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

  /** PRD-approval pause: the run stops after drafting the PRD and waits for approval or revision feedback. */
  describe("PRD approval", () => {
    const RESULT = {
      prd: { content: "Revised PRD content" },
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

    async function startPrdApprovalRun() {
      fetchMock.mockResolvedValueOnce(
        sseResponse([{ type: "prd-approval-request", runId: "run-abc", prd: "## Draft PRD\n\nRoommates argue about bills." }]),
      );

      render(<Home />);
      fireEvent.change(screen.getByPlaceholderText("Describe the product or feature you want a plan for"), {
        target: { value: "an app" },
      });
      fireEvent.click(screen.getByText("Generate plan"));

      await waitFor(() => {
        expect(screen.getByTestId("prd-approval-form")).toBeTruthy();
      });
    }

    it("shows the drafted PRD for approval instead of a result", async () => {
      await startPrdApprovalRun();

      expect(screen.getByTestId("prd-approval-draft").textContent).toContain("Roommates argue about bills.");
      expect(screen.queryByTestId("result-view")).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("posts an approval back against the paused run's id and navigates to its permalink on completion", async () => {
      await startPrdApprovalRun();
      fetchMock.mockResolvedValueOnce(sseResponse([{ type: "result", result: RESULT, runId: "run-abc" }]));

      fireEvent.click(screen.getByTestId("prd-approval-approve"));

      await waitFor(() => {
        expect(pushMock).toHaveBeenCalledWith("/run/run-abc");
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const secondCall = fetchMock.mock.calls[1] as [string, { body: string }];
      expect(JSON.parse(secondCall[1].body)).toEqual({ runId: "run-abc", prdApproval: { approved: true } });
    });

    it("posts feedback back for revision, and shows the revised draft's new approval pause", async () => {
      await startPrdApprovalRun();
      fetchMock.mockResolvedValueOnce(
        sseResponse([
          { type: "prd-approval-request", runId: "run-abc", prd: "## Revised draft\n\nWith a competitive analysis." },
        ]),
      );

      fireEvent.change(screen.getByPlaceholderText("What should change?"), {
        target: { value: "Add a competitive analysis section." },
      });
      fireEvent.click(screen.getByTestId("prd-approval-revise"));

      await waitFor(() => {
        expect(screen.getByTestId("prd-approval-draft").textContent).toContain("competitive analysis");
      });

      const secondCall = fetchMock.mock.calls[1] as [string, { body: string }];
      expect(JSON.parse(secondCall[1].body)).toEqual({
        runId: "run-abc",
        prdApproval: { approved: false, feedback: "Add a competitive analysis section." },
      });
    });
  });
});
