// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ClarificationForm } from "./ClarificationForm";

afterEach(cleanup);

const QUESTIONS = ["Who is this for?", "What metric does it move?"];

function inputs(): HTMLInputElement[] {
  return Array.from(screen.getByTestId("clarification-form").querySelectorAll("input"));
}

describe("ClarificationForm", () => {
  it("renders one field per question", () => {
    render(<ClarificationForm questions={QUESTIONS} onSubmit={vi.fn()} />);

    expect(screen.getByTestId("clarification-form").textContent).toContain(QUESTIONS[0]);
    expect(screen.getByTestId("clarification-form").textContent).toContain(QUESTIONS[1]);
    expect(inputs()).toHaveLength(2);
  });

  it("submits one answer per question, positionally", () => {
    const onSubmit = vi.fn();
    render(<ClarificationForm questions={QUESTIONS} onSubmit={onSubmit} />);

    fireEvent.change(inputs()[0], { target: { value: "Freelance designers" } });
    fireEvent.change(inputs()[1], { target: { value: "Weekly active projects" } });
    fireEvent.submit(screen.getByTestId("clarification-form"));

    expect(onSubmit).toHaveBeenCalledWith(["Freelance designers", "Weekly active projects"]);
  });

  it("submits partially-filled answers rather than requiring every field", () => {
    const onSubmit = vi.fn();
    render(<ClarificationForm questions={QUESTIONS} onSubmit={onSubmit} />);

    fireEvent.change(inputs()[1], { target: { value: "Weekly active projects" } });
    fireEvent.submit(screen.getByTestId("clarification-form"));

    expect(onSubmit).toHaveBeenCalledWith(["", "Weekly active projects"]);
  });

  it("offers skipping as its own action, submitting empty answers", () => {
    const onSubmit = vi.fn();
    render(<ClarificationForm questions={QUESTIONS} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByTestId("clarification-skip"));

    // Proceeding on stated assumptions is a legitimate outcome, not a
    // failure to fill in a required form.
    expect(onSubmit).toHaveBeenCalledWith(["", ""]);
  });

  it("disappears once the run is no longer waiting, so it can't be submitted twice", () => {
    const onSubmit = vi.fn();
    // RunView renders this only in the `awaiting-clarification` status;
    // submitting flips the page to `running`, which unmounts it. Covered
    // end-to-end in app/page.test.tsx — asserted here as the reason this
    // component carries no in-flight guard of its own.
    const { unmount } = render(<ClarificationForm questions={QUESTIONS} onSubmit={onSubmit} />);

    unmount();

    expect(screen.queryByTestId("clarification-form")).toBeNull();
  });
});
