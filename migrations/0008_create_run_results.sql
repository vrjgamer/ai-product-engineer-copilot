-- Backs lib/results/record.ts (TDD 0012, ARCHITECTURE.md §5): the five
-- assembled deliverables of one graph run, keyed by the same run ID as
-- run_traces (and as the checkpointer's thread_id), so a completed run
-- outlives the browser tab it was streamed into.
--
-- Deliberately NOT a foreign key to run_traces, unlike run_evals: TDD 0007
-- writes trace rows best-effort, so a trace can be missing, and an FK would
-- make a failed metrics write take the deliverables down with it. Of the two
-- rows, this is the one the visitor waited for.
--
-- `request` is stored with the result because the deliverables never restate
-- the request they answer, and the permalink's reader may not be the person
-- who typed it. That makes this the first table holding visitor-typed text —
-- see the README's honest-edges note and TDD 0012's "the URL is the
-- capability" section.
CREATE TABLE IF NOT EXISTS run_results (
  run_id TEXT PRIMARY KEY,
  request TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  result JSONB NOT NULL
);
