// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { WhatsNextNote } from "./WhatsNextNote";

afterEach(cleanup);

describe("WhatsNextNote", () => {
  it("names the deferred eval/rigor layer in plain language", () => {
    render(<WhatsNextNote />);

    const text = screen.getByTestId("whats-next-note").textContent ?? "";
    // ARCHITECTURE.md §9's remaining deferred capability. The honest framing
    // is that runs aren't automatically scored for quality.
    expect(text).toMatch(/scor|grad|eval/i);
  });

  it("says what the demo does instead, rather than only what's missing", () => {
    render(<WhatsNextNote />);

    const text = screen.getByTestId("whats-next-note").textContent ?? "";
    expect(text).toContain("assumption");
    expect(text).toContain("trace");
  });

  it("no longer claims the run can't stop to ask a question, now that TDD 0010 built that", () => {
    render(<WhatsNextNote />);

    const text = screen.getByTestId("whats-next-note").textContent ?? "";
    expect(text).not.toMatch(/can.t stop to ask|runs in one shot/i);
    // It still scopes the limit honestly: it asks once, up front, and then
    // runs to the end rather than becoming a conversation.
    expect(text).toMatch(/stop once|ask/i);
  });
});
