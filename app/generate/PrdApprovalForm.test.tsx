// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PrdApprovalForm } from "./PrdApprovalForm";

afterEach(cleanup);

describe("PrdApprovalForm", () => {
  it("renders the drafted PRD for review", () => {
    render(<PrdApprovalForm prd="## Problem\n\nRoommates argue about bills." onApprove={() => {}} onRevise={() => {}} />);

    expect(screen.getByTestId("prd-approval-draft").textContent).toContain("Roommates argue about bills.");
  });

  it("approves with no feedback required", () => {
    const onApprove = vi.fn();
    render(<PrdApprovalForm prd="PRD" onApprove={onApprove} onRevise={() => {}} />);

    fireEvent.click(screen.getByTestId("prd-approval-approve"));

    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("disables sending back for revision until feedback is entered", () => {
    render(<PrdApprovalForm prd="PRD" onApprove={() => {}} onRevise={() => {}} />);

    expect((screen.getByTestId("prd-approval-revise") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("What should change?"), {
      target: { value: "Add a competitive analysis section." },
    });

    expect((screen.getByTestId("prd-approval-revise") as HTMLButtonElement).disabled).toBe(false);
  });

  it("sends the feedback back for revision instead of approving", () => {
    const onApprove = vi.fn();
    const onRevise = vi.fn();
    render(<PrdApprovalForm prd="PRD" onApprove={onApprove} onRevise={onRevise} />);

    fireEvent.change(screen.getByPlaceholderText("What should change?"), {
      target: { value: "Add a competitive analysis section." },
    });
    fireEvent.click(screen.getByTestId("prd-approval-revise"));

    expect(onRevise).toHaveBeenCalledWith("Add a competitive analysis section.");
    expect(onApprove).not.toHaveBeenCalled();
  });
});
