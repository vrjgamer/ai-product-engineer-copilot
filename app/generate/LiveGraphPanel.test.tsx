// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { ProgressEvent } from "../../lib/graph/progress";
import { LiveGraphPanel } from "./LiveGraphPanel";

afterEach(cleanup);

describe("LiveGraphPanel", () => {
  it("renders the graph driven by the live progress events", () => {
    const events: ProgressEvent[] = [{ type: "node-status", node: "prdAgent", status: "running" }];
    render(<LiveGraphPanel events={events} />);

    expect(screen.getByTestId("graph-node-prdAgent").getAttribute("data-state")).toBe("running");
  });

  it("selecting a node in the graph shows its detail", () => {
    const events: ProgressEvent[] = [{ type: "node-status", node: "prdAgent", status: "completed" }];
    render(<LiveGraphPanel events={events} />);

    expect(screen.getByTestId("node-detail-empty")).toBeTruthy();
    fireEvent.click(screen.getByTestId("graph-node-prdAgent"));
    expect(screen.getByTestId("node-detail-state").textContent).toBe("completed");
  });

  it("marks unreached nodes aborted once the run has fatally errored", () => {
    const events: ProgressEvent[] = [{ type: "node-status", node: "supervisor", status: "completed" }];
    render(<LiveGraphPanel events={events} aborted />);

    expect(screen.getByTestId("graph-node-roadmapAgent").getAttribute("data-aborted")).toBe("true");
  });
});
