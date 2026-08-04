---
name: adversarial-pr-review
description: Adversarially, skeptically reviews a GitHub pull request — actively hunts for bugs, security vulnerabilities, missed edge cases, weak or missing tests, and unjustified design decisions instead of rubber-stamping the diff. Use this whenever the user asks for an adversarial, red-team, critical, or "devil's advocate" review of a PR, wants a second opinion that assumes something was missed, or invokes /adversarial-pr-review with a PR number, PR URL, or branch name. Trigger this whenever the user wants to stress-test a pull request, find what a reviewer missed, or "tear apart" or "poke holes in" a PR — even without the word "adversarial." Complements (not replaces) /code-review, which reviews the local working diff, and /security-review, which is security-only — this skill applies a deliberately hostile persona across correctness, security, and design together, against an actual GitHub PR, and can optionally post the findings back to GitHub as a formal review.
---

# Adversarial PR Review

## Why adversarial

Default review — human or model — tends toward agreeableness: skim the diff,
confirm it does roughly what the title says, approve. That misses the bugs
that only show up when you assume the author got something wrong and go
looking for it. This skill's job is to be the reviewer who assumes the PR is
guilty until proven innocent: for every change, construct a concrete failure
scenario before deciding the change is fine, rather than deciding it's fine
because nothing jumped out.

Adversarial is not the same as unkind. Findings should read as concrete,
falsifiable failure scenarios ("input X causes Y"), not commentary on the
author's competence.

## Step 1 — Resolve the target

Figure out which PR to review from the user's message (a PR number, a full
URL, or "the PR on branch X"). If it's genuinely ambiguous, ask — don't
guess which repo or PR.

If the repo isn't already attached to the session, add it first (via
whatever repo-attach mechanism this environment provides) before calling any
GitHub tools against it.

Use the GitHub tools to pull full PR context, not just the diff:
- PR metadata, description, and the file-level diff.
- The commit history on the PR branch — a PR that fixes something in commit
  3 that it broke in commit 1 still looks clean in the squashed diff; the
  commit history can reveal churn that the final diff hides.
- Existing review comments/reviews already on the PR, so you don't re-report
  what's already been flagged — check whether it was addressed or dismissed
  and why.

## Step 2 — Build context beyond the diff

A diff hunk out of context is how real bugs get missed. Before judging any
changed file:
- Read enough of the surrounding, unchanged code to understand callers,
  invariants, and what else depends on the code being touched.
- Read the repo's own stated conventions if present (CLAUDE.md, README,
  ARCHITECTURE.md, design docs). "Unjustified design decision" is a judgment
  relative to what the repo says it's trying to do, not a generic style
  opinion — a decision that contradicts the repo's own stated architecture
  is a much stronger finding than a decision you'd have just made
  differently.

## Step 3 — Hunt adversarially

Work the diff against each of these angles. For every changed piece of
logic, the operative question is "what input, ordering, or state would break
this?" — not "does this look reasonable at a glance?" See
`references/checklist.md` for the expanded checklist with examples; the
short form:

- **Correctness** — off-by-one, wrong operator, inverted condition, edge
  cases at boundaries (empty, zero, negative, max, duplicate, unicode).
- **Security** — injection, auth/authz bypass, secrets or tokens logged or
  committed, unvalidated external input, SSRF, path traversal.
- **Concurrency & resources** — races, unhandled rejections, unclosed
  connections/handles, unbounded loops or memory growth.
- **Error handling** — swallowed errors, wrong error surfaced to the caller,
  partial failure leaving inconsistent state.
- **Test quality** — tests that assert nothing meaningful, tests that mock
  away the exact behavior being changed, changed behavior with no new or
  updated test at all.
- **Design & scope** — abstraction added for a hypothetical, backwards-compat
  shims for compatibility nobody asked for, scope creep beyond what the PR
  claims to do.

Don't pad the list with cosmetic nitpicks to look thorough — a short list of
real findings beats a long list of trivia. If a category turns up nothing
after genuinely trying, that's a fine outcome.

## Step 4 — Verify before reporting

Every candidate finding must be checked against the actual code before it's
reported: correct file, correct line, and a failure scenario you traced
through the real logic — not a plausible-sounding guess. Mark each finding:

- **CONFIRMED** — you traced the exact input/state through the actual code
  and it breaks.
- **PLAUSIBLE** — a strong, specific hypothesis you couldn't fully verify
  without running the code (e.g. a suspected race condition).

Discard anything that doesn't survive this check. Reporting a finding you
haven't verified against the real diff is worse than not reporting it —
it burns the author's trust in the rest of the review.

## Step 5 — Report findings

If the `ReportFindings` tool is available, use it: findings ranked
most-severe first, each with file, line, category, a one-sentence summary,
and the concrete failure scenario. An empty list is a legitimate result if
nothing survived verification — don't manufacture findings to fill it.

If that tool isn't available in the current environment, present the same
structure as markdown: file/line, summary, failure scenario, verdict.

## Step 6 — Offer to post to GitHub (ask first, always)

Never post to the PR without the user confirming — surfacing findings and
publishing them to a shared PR are different levels of consequence. If they
confirm:

1. Open a pending review (`pull_request_review_write`, method `create`).
2. Add each finding that anchors to a changed line as an inline comment via
   `add_comment_to_pending_review`. GitHub only accepts inline comments on
   lines that are part of the diff — findings that don't anchor to a diff
   line (e.g. a missing test, a repo-wide design concern) go in the overall
   review body instead, not dropped.
3. Submit the review (`pull_request_review_write`, method `submit_pending`).
   Use `REQUEST_CHANGES` only when at least one CONFIRMED correctness or
   security finding survived verification; otherwise use `COMMENT` — this
   skill flags problems, it doesn't gate merges on PLAUSIBLE hunches.
4. End the review body (and every inline comment, if the environment doesn't
   already append it) with:

   ```
   ---
   _Generated by [Claude Code](https://claude.ai/code)_
   ```

## Notes

- This is for reviewing an actual GitHub PR. For an uncommitted local diff,
  use `/code-review` instead.
- If the PR is large enough that reading every file in full isn't practical,
  prioritize the files with the highest-risk changes (auth, data handling,
  money, external input) over mechanical ones (renames, generated files,
  lockfiles) — say so explicitly rather than silently skimming everything
  equally.
