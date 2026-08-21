import { getDb, type DbClient } from "../db/client";
import type { AssembledResult } from "../graph/state";

export interface RunResult {
  runId: string;
  /**
   * The request the run answered. Stored alongside the result because the
   * deliverables refer to "the product" throughout and never restate it — a
   * stored plan is close to unreadable without it, and the permalink's reader
   * isn't necessarily the person who typed it (TDD 0012).
   */
  request: string;
  createdAt: string;
  result: AssembledResult;
}

/**
 * Persists one run's assembled deliverables (TDD 0012), keyed by the same
 * `runId` as its trace row. Mirrors `lib/tracing/record.ts` and
 * `lib/eval/record.ts` down to the injected `db`, for the same reasons and
 * with the same test shape.
 *
 * Deliberately *not* `REFERENCES run_traces(run_id)` the way `run_evals` is:
 * TDD 0007 writes traces best-effort, so a trace row isn't guaranteed to
 * exist, and an FK would let a transient failure writing metrics silently
 * destroy the deliverables — backwards, given which of the two the visitor
 * waited five minutes for.
 *
 * The upsert keeps a run to one row under a retry, and under TDD 0010's
 * resumed second leg.
 */
export async function recordRunResult(record: RunResult, db: DbClient = getDb()): Promise<void> {
  await db.query(
    `INSERT INTO run_results (run_id, request, created_at, result)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (run_id) DO UPDATE SET
       request = EXCLUDED.request,
       created_at = EXCLUDED.created_at,
       result = EXCLUDED.result`,
    [record.runId, record.request, record.createdAt, JSON.stringify(record.result)],
  );
}

export interface RunSummary {
  runId: string;
  request: string;
  createdAt: string;
}

interface RunResultRow {
  run_id: string;
  request: string;
  created_at: string | Date;
  result: AssembledResult;
}

/** Fetches one run's stored deliverables for the permalink page (app/run/[runId]/page.tsx) — `null` if that run never stored a result (it failed, is still running, or predates TDD 0012). */
export async function getRunResult(
  runId: string,
  db: DbClient = getDb(),
): Promise<RunResult | null> {
  const { rows } = await db.query<RunResultRow>(
    `SELECT run_id, request, created_at, result FROM run_results WHERE run_id = $1`,
    [runId],
  );
  const row = rows[0];
  if (!row) return null;

  return {
    runId: row.run_id,
    request: row.request,
    createdAt: new Date(row.created_at).toISOString(),
    result: row.result,
  };
}

interface RunSummaryRow {
  run_id: string;
  request: string;
  created_at: string | Date;
}

/**
 * Lists the most recent runs (request + timestamp only, no deliverables —
 * this is a lightweight feed, not a fetch of every result) for the main
 * page's "recent runs" sidebar. This is a deliberate reversal of TDD 0012's
 * "the URL is the capability, nothing enumerates run IDs" stance: a run's
 * permalink is still unguessable to anyone who doesn't see it here or get
 * it shared, but this makes every visitor's request text visible to every
 * other visitor. Product decision, not an oversight.
 */
export async function listRecentRuns(limit = 30, db: DbClient = getDb()): Promise<RunSummary[]> {
  const { rows } = await db.query<RunSummaryRow>(
    `SELECT run_id, request, created_at FROM run_results ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );

  return rows.map((row) => ({
    runId: row.run_id,
    request: row.request,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}
