// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AssembledResult } from "../../lib/graph/state";
import { ResultView } from "./ResultView";

afterEach(cleanup);

describe("ResultView", () => {
  it("shows an explicit unavailable note (not a blank panel) when a node's own generation failed entirely", () => {
    const result: AssembledResult = {
      prd: null,
      userStories: { content: "User stories content" },
      architectureReview: { content: "Architecture review content" },
      experimentDesign: { content: "Experiment design content" },
      roadmap: { content: "Roadmap content" },
      errors: [{ node: "prdAgent", message: "model unavailable" }],
    };

    render(<ResultView result={result} />);

    // First section with content (userStories) is selected by default since prd is null.
    expect(screen.getByTestId("content-userStories")).toBeTruthy();

    fireEvent.click(screen.getByTestId("tab-prd"));

    expect(screen.getByTestId("unavailable-prd").textContent).toContain("model unavailable");
    expect(screen.queryByTestId("content-prd")).toBeNull();
  });
});
