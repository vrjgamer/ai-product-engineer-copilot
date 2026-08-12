import { describe, expect, it } from "vitest";

import { MAX_CLARIFYING_QUESTIONS, parseQuestions } from "./supervisor";

/**
 * The supervisor's triage answer comes back as free text from a model, so
 * this covers the shapes one actually returns. The governing rule (TDD
 * 0010): "couldn't parse" and "nothing to ask" are the same outcome — run
 * unclarified. A stray backtick must never crash a run.
 */
describe("parseQuestions", () => {
  it("reads a plain JSON array", () => {
    expect(parseQuestions('["Who is it for?", "What does success look like?"]')).toEqual([
      "Who is it for?",
      "What does success look like?",
    ]);
  });

  it("reads an array wrapped in a fenced code block", () => {
    expect(parseQuestions('```json\n["Who is it for?"]\n```')).toEqual(["Who is it for?"]);
  });

  it("reads an array with prose around it", () => {
    expect(parseQuestions('Sure! Here you go:\n["Who is it for?"]\nHope that helps.')).toEqual([
      "Who is it for?",
    ]);
  });

  it("treats an empty array as nothing to ask", () => {
    expect(parseQuestions("[]")).toEqual([]);
  });

  it("treats unparseable output as nothing to ask rather than throwing", () => {
    expect(parseQuestions("I think the request is clear enough.")).toEqual([]);
    expect(parseQuestions("[not json")).toEqual([]);
    expect(parseQuestions("")).toEqual([]);
  });

  it("reads the array out of an object wrapper", () => {
    // Models ignore "reply with the array and nothing else" often enough
    // that pulling the array out is worth more than being strict about it.
    expect(parseQuestions('{"questions": ["Who is it for?"]}')).toEqual(["Who is it for?"]);
  });

  it("treats a JSON value that isn't an array at all as nothing to ask", () => {
    expect(parseQuestions('"Who is it for?"')).toEqual([]);
    expect(parseQuestions("null")).toEqual([]);
  });

  it("drops non-string and blank entries", () => {
    expect(parseQuestions('["Who is it for?", 42, "", "   ", null]')).toEqual(["Who is it for?"]);
  });

  it("caps the list so the form stays answerable", () => {
    const many = JSON.stringify(Array.from({ length: 10 }, (_, index) => `Question ${index}?`));

    expect(parseQuestions(many)).toHaveLength(MAX_CLARIFYING_QUESTIONS);
  });
});
