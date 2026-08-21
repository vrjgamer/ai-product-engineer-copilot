# TDD 0016 — A domain corpus for the example prompts

**Depends on:** 0004 (the `docs-store` MCP server and `doc_chunks` this
repopulates), 0013 (indexing-on-deploy, which this makes worth doing).
**Unblocks:** 0017 (a relevance threshold is only meaningful once the corpus
contains something a query can be genuinely near or far from).

## Context

`search_docs` is the system's one grounding mechanism, and it is currently
searching the wrong library.

`scripts/index-docs.ts` indexes this repository's own engineering
documentation — `ARCHITECTURE.md`, `VISION.md`, `README.md`, and every
`docs/tdd/*.md`. TDD 0004 chose that deliberately and said why: the repo was
the one real, non-fixture markdown corpus available at the time, and using it
proved the pipeline end-to-end without inventing content. That was the right
call for 0004's purpose, which was *does embedding-based retrieval work*.

It is the wrong corpus for what the product actually does. A visitor asks for
a plan for a roommate bill-splitting app; `searchDocs` embeds that request,
finds the five nearest chunks in a library about LangGraph supervisor routing
and Vercel Fluid Compute, and `formatDocsContext` hands them to the PRD agent
under the header **"Relevant docs:"**.

Three things make this worse than simply unhelpful:

- **`searchDocs` has no distance floor.** It is `ORDER BY embedding <=> $1
  LIMIT 5` with no `WHERE`. There is no such thing as "nothing relevant
  found" — the query returns the five nearest chunks in the corpus whether
  they sit at cosine distance 0.1 or 0.95. Retrieval cannot fail, so it never
  reports failure.
- **The label asserts relevance the retrieval never established.**
  `formatDocsContext` prefixes results with "Relevant docs:" unconditionally.
  The model is being told these passages are relevant, by a system that did
  not check.
- **It undermines the claim it exists to support.** ARCHITECTURE §3 defends
  real pgvector retrieval over fixtures on the grounds that fixtures "prove
  the MCP pattern but not that MCP is doing anything real." Retrieval that
  always returns something and is always about the wrong subject is a
  subtler version of the same failure: the mechanism is real, the grounding
  is not.

This phase replaces the corpus with domain documents that a query about a
product can actually be grounded in — including for a fourth example prompt
(a game) added because the current three are all utility software, and a
corpus that only covers CRUD-ish products makes the retrieval look better
than it is.

## Scope

**In scope:**

- **A `corpus/` directory of synthetic domain documents**, committed to the
  repo, organized per example prompt. For each of the four examples, a small
  set (3–5) of the kinds of document a PM would genuinely have before
  writing a PRD — competitive landscape notes, user-research summaries,
  domain/pricing constraints, a relevant technical-feasibility memo. Realistic
  in shape and specificity; a document that says nothing retrieves as poorly
  as no document.
- **A fourth example prompt: a game.** Added to `EXAMPLE_PROMPTS` in
  `app/page.tsx`, with its own corpus documents. Games stress the deliverables
  differently — "user stories" for a puzzle game are level/progression
  design, an "experiment design" is a retention or difficulty-curve test —
  which is a better demonstration of the graph than a fourth business tool.
- **An explicit synthetic-content marker.** Every corpus document carries a
  header stating it is illustrative demo content, and its `sourceId` makes
  that visible in the citation itself (e.g. `corpus/roommate-billing/
  competitive-landscape.md`). See "the honesty problem" below — this is the
  load-bearing part of this TDD, not a formatting detail.
- **`scripts/index-docs.ts` indexes both** the new corpus and the repo's own
  docs. The repo docs stay because they are genuinely the right answer when
  someone asks this system to plan a change to *itself*, which is a natural
  thing for a technical visitor to try. Vector similarity is what decides
  between them, which is precisely what it is for — once 0017 gives it a
  floor.
- **Corpus documents are exercised by a test** that asserts each example
  prompt retrieves at least one document from its own domain set, so a
  future corpus edit that breaks retrieval fails the suite rather than
  quietly degrading output. (Embedding calls mocked per §8; the assertion is
  about wiring and `sourceId` conventions, not embedding quality.)

**Out of scope:**

- **The relevance threshold itself** — 0017 owns it. This phase makes the
  corpus worth thresholding; it does not add the `WHERE`.
- **Fixing `formatDocsContext`'s unconditional "Relevant docs:" label.** Also
  0017, for the same reason: the honest label depends on whether a floor was
  cleared.
- **Real (non-synthetic) domain documents.** Licensing, and the fact that
  scraped third-party research would need to be accurate rather than merely
  plausible. Named here so the synthetic choice reads as a decision.

## The honesty problem

This is the part worth getting right, and the reason this TDD is longer than
its diff suggests.

The corpus documents are fabricated. They will contain plausible-looking
market sizes, competitor feature comparisons, and user-research findings that
no one researched. Those numbers will be retrieved, cited with a
`[source:...]` tag, and folded into a PRD that a visitor may read as
grounded analysis — and the citation tag, which exists as an
*anti*-hallucination device, will make fabricated inputs look more
trustworthy, not less.

That is a genuinely bad failure mode for a project whose stated virtue is
honest scoping, and it is worse in the specific setting this demo is built
for: an interviewer reading a confident PRD citing invented statistics has
found a credibility problem, not a feature.

The resolution is that synthetic content must be undeniable at every layer it
surfaces:

1. **In the document** — a first-line header marking it as illustrative demo
   content, which lands in the chunk text and therefore in what the model
   reads.
2. **In the `sourceId`** — a `corpus/` prefix, visible in every citation.
3. **In the UI** — the existing honest-edges note (`app/WhatsNextNote.tsx`,
   the 0009/0011 pattern) gains a line saying the grounding corpus is
   illustrative sample material, not real market research.

The alternative — unlabelled fake documents that read as real — is rejected
outright. It would make the demo *look* stronger and be materially
dishonest, which is the exact trade the rebuild's premise (ARCHITECTURE's
opening: a previous version whose "live demo faked the thing it was supposed
to demonstrate") exists to refuse.

## Acceptance criteria

- Each of the four example prompts retrieves domain-matched documents, proven
  by a test.
- Every corpus document is identifiable as synthetic from its content, its
  `sourceId`, and the UI — without opening the repo.
- The repo's own docs remain indexed and still win for questions about this
  system.
- `scripts/index-docs.ts` indexes both sets in one pass and remains
  idempotent.
- A visitor who reads only the rendered output can tell the grounding is
  illustrative.

## Notes for the implementing session

- **Write the corpus documents to be retrievable, not to be impressive.**
  Specific nouns and numbers are what embed well and what make a PRD concrete.
  A document of hedged generalities is invisible to cosine distance.
- **Vary the vocabulary between domains deliberately.** If all four sets are
  written in the same voice with the same words, the retrieval will look
  better than it is — every query will land near everything. Overlapping
  vocabulary across domains is a *feature* for testing 0017's threshold.
- **The game example's corpus is the one most likely to be written lazily.**
  Retention curves, session length, monetization model, and difficulty tuning
  are the domain's real vocabulary; "fun" and "engaging" are not.
- Keep documents short (roughly 300–800 words). `indexCorpus` chunks them, and
  a handful of tight documents retrieves better than a few sprawling ones.
