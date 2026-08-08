// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

afterEach(cleanup);

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
});
