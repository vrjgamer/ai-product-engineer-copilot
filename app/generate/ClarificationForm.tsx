"use client";

import { useState } from "react";
import type { FormEvent } from "react";

export interface ClarificationFormProps {
  questions: string[];
  /** Receives one answer per question, positionally; empty strings are dropped server-side. */
  onSubmit: (answers: string[]) => void;
}

/**
 * The visitor-facing half of TDD 0010's pause. The run is parked at a
 * durable checkpoint while this is on screen — nothing is being held open,
 * so there's no timer and no urgency to communicate.
 *
 * Submitting either way flips the page back to `running`, which unmounts
 * this form — so there's no double-submit window to guard against here.
 *
 * Skipping is a real button rather than a "just leave it blank" affordance:
 * proceeding on stated assumptions is what v1 always did and is still a
 * perfectly good outcome, so the UI shouldn't imply the questions are a
 * required gate.
 */
export function ClarificationForm({ questions, onSubmit }: ClarificationFormProps) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));

  function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    onSubmit(answers);
  }

  return (
    <form className="card clarification" onSubmit={handleSubmit} data-testid="clarification-form">
      <h2 className="section-title">A couple of questions first</h2>
      <p className="clarification-lede">
        Your description could go a few different ways. Answer what you can — anything you skip, the
        agents will assume and say so in the output.
      </p>

      {questions.map((question, index) => (
        <label className="clarification-field" key={question}>
          <span className="clarification-question">{question}</span>
          <input
            type="text"
            value={answers[index] ?? ""}
            onChange={(changeEvent) =>
              setAnswers((current) =>
                current.map((answer, position) =>
                  position === index ? changeEvent.target.value : answer,
                ),
              )
            }
          />
        </label>
      ))}

      <div className="clarification-actions">
        <button
          className="chip"
          type="button"
          data-testid="clarification-skip"
          onClick={() => onSubmit(questions.map(() => ""))}
        >
          Skip — make assumptions
        </button>
        <button className="btn-primary" type="submit">
          Continue
        </button>
      </div>
    </form>
  );
}
