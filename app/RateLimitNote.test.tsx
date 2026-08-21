// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RateLimitNote } from "./RateLimitNote";

afterEach(cleanup);

describe("RateLimitNote", () => {
  it("proactively states the rate limit and the model in use", () => {
    render(<RateLimitNote />);

    const text = screen.getByTestId("rate-limit-note").textContent;
    expect(text).toContain("5 runs/hour");
    expect(text).toContain("Gemini 3.6 Flash");
  });
});
