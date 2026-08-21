// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RunSummary } from "../lib/results/record";
import { RecentRunsSidebar } from "./RecentRunsSidebar";

afterEach(cleanup);

describe("RecentRunsSidebar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows an empty state when there are no runs yet", () => {
    render(<RecentRunsSidebar runs={[]} />);

    expect(screen.getByTestId("recent-runs-empty")).toBeTruthy();
    expect(screen.queryByTestId("recent-run-link")).toBeNull();
  });

  it("links each run to its permalink, opening in a new tab", () => {
    const runs: RunSummary[] = [
      { runId: "run-1", request: "A todo app", createdAt: "2026-01-01T11:45:00.000Z" },
    ];

    render(<RecentRunsSidebar runs={runs} />);

    const link = screen.getByTestId("recent-run-link");
    expect(link.getAttribute("href")).toBe("/run/run-1");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.textContent).toContain("A todo app");
  });

  it("shows a coarse relative time for each run", () => {
    const runs: RunSummary[] = [
      { runId: "run-1", request: "Recent one", createdAt: "2026-01-01T11:45:00.000Z" }, // 15m ago
      { runId: "run-2", request: "Older one", createdAt: "2026-01-01T09:00:00.000Z" }, // 3h ago
    ];

    render(<RecentRunsSidebar runs={runs} />);

    const links = screen.getAllByTestId("recent-run-link");
    expect(links[0].textContent).toContain("15m ago");
    expect(links[1].textContent).toContain("3h ago");
  });

  it("renders every run passed in, in the order given", () => {
    const runs: RunSummary[] = Array.from({ length: 5 }, (_unused, index) => ({
      runId: `run-${index}`,
      request: `Request ${index}`,
      createdAt: "2026-01-01T11:00:00.000Z",
    }));

    render(<RecentRunsSidebar runs={runs} />);

    expect(screen.getAllByTestId("recent-run-link")).toHaveLength(5);
  });
});
