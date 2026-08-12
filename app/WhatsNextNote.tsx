/**
 * TDD 0009 / ARCHITECTURE.md §9: a visitor-facing version of what's
 * deliberately not built. Plain language on purpose — the architecture doc's
 * framing ("golden-set regression harness, LLM-as-judge") is for someone
 * reading the repo, not for someone who just ran the demo. Kept honest in
 * both directions: what isn't built, and what the system does instead.
 *
 * TDD 0010 removed one of the two items this used to list — the run can now
 * stop and ask. TDD 0011 narrowed the other: quality *is* scored now, but by
 * a harness run by hand against a fixed set of cases, not on the run you
 * just did. Saying "nothing scores it" would now be false; saying "it's
 * scored" would imply your run was, which it wasn't.
 */
export function WhatsNextNote() {
  return (
    <footer className="whats-next" data-testid="whats-next-note">
      <h2 className="section-title">What this demo doesn&apos;t do yet</h2>
      <p>
        Your run wasn&apos;t graded. There is a scoring harness — a fixed set of test requests, run
        by hand before a deploy, with a second model grading each document against a rubric and a
        regression gate that fails on a drop — but it deliberately doesn&apos;t run on live traffic,
        because judging every run would roughly double what this demo costs to operate. What your
        run does get is a trace of what it did: which agents ran, how long they took, what they
        cost.
      </p>
      <p>
        It also stays a single request, not a conversation. If your description is vague it will
        stop once, up front, to ask — but after that it runs to the end on stated assumptions rather
        than checking back in.
      </p>
      <p className="whats-next-pointer">
        The reasoning for both is written down in <code>ARCHITECTURE.md</code> §9.
      </p>
    </footer>
  );
}
