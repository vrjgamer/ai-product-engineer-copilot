"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface PrdApprovalFormProps {
  /** The drafted PRD's markdown content, straight from `prdAgent`. */
  prd: string;
  onApprove: () => void;
  /** Sends the run back to `prdAgent` for a revised draft, folding this feedback into its prompt. */
  onRevise: (feedback: string) => void;
}

/**
 * The second pause point in the run: everything downstream — user stories,
 * architecture review, experiment design, roadmap — builds on this PRD, so
 * it's reviewed before the fan-out starts rather than discovered wrong five
 * documents later. Feedback is optional and is what drives the loop:
 * approving needs nothing typed, sending it back for revision does.
 */
export function PrdApprovalForm({ prd, onApprove, onRevise }: PrdApprovalFormProps) {
  const [feedback, setFeedback] = useState("");

  function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    onApprove();
  }

  return (
    <form className="card prd-approval" onSubmit={handleSubmit} data-testid="prd-approval-form">
      <h2 className="section-title">Review the PRD before moving on</h2>
      <p className="clarification-lede">
        User stories, architecture review, experiment design, and roadmap all build on this PRD — approve it
        to continue, or leave feedback below to send it back for a revised draft.
      </p>

      <div className="markdown-body prd-approval-draft" data-testid="prd-approval-draft">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{prd}</ReactMarkdown>
      </div>

      <label className="clarification-field">
        <span className="clarification-question">Feedback (optional) — leave blank to approve as-is</span>
        <textarea
          rows={3}
          value={feedback}
          onChange={(changeEvent) => setFeedback(changeEvent.target.value)}
          placeholder="What should change?"
        />
      </label>

      <div className="clarification-actions">
        <button
          className="chip"
          type="button"
          data-testid="prd-approval-revise"
          disabled={!feedback.trim()}
          onClick={() => onRevise(feedback.trim())}
        >
          Send back for revision
        </button>
        <button className="btn-primary" type="submit" data-testid="prd-approval-approve">
          Approve, continue →
        </button>
      </div>
    </form>
  );
}
