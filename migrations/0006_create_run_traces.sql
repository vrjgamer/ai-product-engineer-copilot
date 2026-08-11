-- Backs lib/tracing/record.ts (TDD 0007, ARCHITECTURE.md §7): one row per
-- graph run, keyed by the same run ID used as the checkpointer's thread_id.
CREATE TABLE IF NOT EXISTS run_traces (
  run_id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  nodes JSONB NOT NULL,
  total_cost_usd NUMERIC NOT NULL
);
