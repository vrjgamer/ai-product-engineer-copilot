// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { WhatsNextNote } from "./WhatsNextNote";

afterEach(cleanup);

describe("WhatsNextNote", () => {
  it("names both deliberately deferred capabilities in plain language", () => {
    render(<WhatsNextNote />);

    const text = screen.getByTestId("whats-next-note").textContent ?? "";
    // ARCHITECTURE.md §9's first deferred capability: clarifying questions
    // (LangGraph interrupt/resume) — described here without the jargon.
    expect(text).toContain("clarifying question");
    // §9's second: the eval/rigor layer. The honest framing is that runs
    // aren't automatically scored for quality.
    expect(text).toMatch(/scor|grad|eval/i);
  });

  it("says what the demo does instead, rather than only what's missing", () => {
    render(<WhatsNextNote />);

    const text = screen.getByTestId("whats-next-note").textContent ?? "";
    expect(text).toContain("assumption");
    expect(text).toContain("trace");
  });
});
