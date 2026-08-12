-- Backs lib/eval/record.ts (TDD 0011, ARCHITECTURE.md §9): at most one
-- quality judgment per graph run, keyed by the same run ID as run_traces
-- (and as the checkpointer's thread_id).
--
-- Deliberately a separate table rather than columns on run_traces: a trace
-- is written by every run, an eval only by the manually-invoked harness, so
-- most rows would be null. The FK is what ties them together, and ON DELETE
-- CASCADE means a deleted trace can't leave an orphaned score behind.
CREATE TABLE IF NOT EXISTS run_evals (
  run_id TEXT PRIMARY KEY REFERENCES run_traces(run_id) ON DELETE CASCADE,
  case_id TEXT,
  judged_at TIMESTAMPTZ NOT NULL,
  judge_model_id TEXT NOT NULL,
  overall_score NUMERIC NOT NULL,
  deliverables JSONB NOT NULL,
  missing JSONB NOT NULL,
  tags JSONB NOT NULL,
  cost_usd NUMERIC NOT NULL
);
