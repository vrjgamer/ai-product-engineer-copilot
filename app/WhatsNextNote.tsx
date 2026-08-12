/**
 * TDD 0009 / ARCHITECTURE.md §9: a visitor-facing version of the two
 * deliberately deferred capabilities. Plain language on purpose — the
 * architecture doc's framing ("LangGraph interrupt/resume", "golden-set
 * regression harness, LLM-as-judge") is for someone reading the repo, not
 * for someone who just ran the demo. Kept honest in both directions: what
 * isn't built, and what the system does instead.
 */
export function WhatsNextNote() {
  return (
    <footer className="whats-next" data-testid="whats-next-note">
      <h2 className="section-title">What this demo doesn&apos;t do yet</h2>
      <p>
        It runs in one shot. It can&apos;t stop to ask you a clarifying question when your
        description is ambiguous — instead, each agent states the assumption it made and keeps
        going, so you can see what it guessed and rewrite your prompt.
      </p>
      <p>
        And nothing automatically scores the writing it produces. Every run records a trace of what
        it did (which agents ran, how long they took, what they cost), but judging whether a PRD is
        actually <em>good</em> is still a human reading it.
      </p>
      <p className="whats-next-pointer">
        Both are deliberate v1 scope cuts, with the reasoning written down in{" "}
        <code>ARCHITECTURE.md</code> §9.
      </p>
    </footer>
  );
}
