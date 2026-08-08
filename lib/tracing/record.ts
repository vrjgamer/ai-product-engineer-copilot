import { getDb, type DbClient } from "../db/client";

export interface NodeTrace {
  node: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  mcpCalls: string[];
}

export interface RunTrace {
  runId: string;
  startedAt: string;
  endedAt: string;
  nodes: NodeTrace[];
  totalCostUsd: number;
}

/**
 * Persists one trace row per graph run (TDD 0007, ARCHITECTURE.md §7),
 * keyed by `runId` (the same ID used as the checkpointer's thread_id).
 * `db` is injected (mirrors lib/rate-limit/check.ts) so this is testable
 * against a fixture DB instead of a real Postgres instance.
 */
export async function recordRunTrace(trace: RunTrace, db: DbClient = getDb()): Promise<void> {
  await db.query(
    `INSERT INTO run_traces (run_id, started_at, ended_at, nodes, total_cost_usd)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (run_id) DO UPDATE SET
       started_at = EXCLUDED.started_at,
       ended_at = EXCLUDED.ended_at,
       nodes = EXCLUDED.nodes,
       total_cost_usd = EXCLUDED.total_cost_usd`,
    [trace.runId, trace.startedAt, trace.endedAt, JSON.stringify(trace.nodes), trace.totalCostUsd],
  );
}

interface RunTraceRow {
  run_id: string;
  started_at: string | Date;
  ended_at: string | Date;
  nodes: NodeTrace[];
  total_cost_usd: string | number;
}

/** Fetches one run's trace for the trace-view page (app/trace/[runId]/page.tsx) — `null` if no run with that ID has been traced. */
export async function getRunTrace(runId: string, db: DbClient = getDb()): Promise<RunTrace | null> {
  const { rows } = await db.query<RunTraceRow>(
    `SELECT run_id, started_at, ended_at, nodes, total_cost_usd FROM run_traces WHERE run_id = $1`,
    [runId],
  );
  const row = rows[0];
  if (!row) return null;

  return {
    runId: row.run_id,
    startedAt: new Date(row.started_at).toISOString(),
    endedAt: new Date(row.ended_at).toISOString(),
    nodes: row.nodes,
    totalCostUsd: Number(row.total_cost_usd),
  };
}
