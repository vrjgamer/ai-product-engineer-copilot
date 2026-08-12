/**
 * TDD 0009 / ARCHITECTURE.md §9: a visitor-facing version of what's
 * deliberately not built. Plain language on purpose — the architecture doc's
 * framing ("golden-set regression harness, LLM-as-judge") is for someone
 * reading the repo, not for someone who just ran the demo. Kept honest in
 * both directions: what isn't built, and what the system does instead.
 *
 * TDD 0010 removed one of the two items this used to list — the run can now
 * stop and ask — so the note describes the limit that actually remains
 * rather than a stale scope cut.
 */
export function WhatsNextNote() {
  return (
    <footer className="whats-next" data-testid="whats-next-note">
      <h2 className="section-title">What this demo doesn&apos;t do yet</h2>
      <p>
        Nothing automatically scores the writing it produces. Every run records a trace of what it
        did (which agents ran, how long they took, what they cost), but judging whether a PRD is
        actually <em>good</em> is still a human reading it.
      </p>
      <p>
        It also stays a single request, not a conversation. If your description is vague it will
        stop once, up front, to ask — but after that it runs to the end on stated assumptions rather
        than checking back in.
      </p>
      <p className="whats-next-pointer">
        Both are deliberate scope cuts, with the reasoning written down in{" "}
        <code>ARCHITECTURE.md</code> §9.
      </p>
    </footer>
  );
}
