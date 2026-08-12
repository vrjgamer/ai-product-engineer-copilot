import { getDb, type DbClient } from "../db/client";
import type { RunEvaluation } from "./judge";
import type { DeliverableJudgment } from "./judge";
import type { DeliverableName, FailureTag } from "./rubric";

export interface RunEvalRecord {
  runId: string;
  /** The golden case this run came from, when it came from one — null for a run evaluated ad hoc. */
  caseId: string | null;
  judgedAt: string;
  evaluation: RunEvaluation;
}

/**
 * Persists one run's quality judgment (TDD 0011), keyed by the same `runId`
 * as its trace row. Mirrors `lib/tracing/record.ts` down to the injected
 * `db` — same reasons, same test shape.
 *
 * Nothing in the request path calls this: visitor runs are not judged
 * (ARCHITECTURE.md §9 — judging every run would roughly double the model
 * spend on a demo whose whole cost argument is that it's cheap). The writer
 * is `scripts/eval.ts`, and the reader is the trace page, which shows a
 * quality section only for the runs that actually have one.
 */
export async function recordRunEval(record: RunEvalRecord, db: DbClient = getDb()): Promise<void> {
  const { evaluation } = record;

  await db.query(
    `INSERT INTO run_evals (run_id, case_id, judged_at, judge_model_id, overall_score, deliverables, missing, tags, cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (run_id) DO UPDATE SET
       case_id = EXCLUDED.case_id,
       judged_at = EXCLUDED.judged_at,
       judge_model_id = EXCLUDED.judge_model_id,
       overall_score = EXCLUDED.overall_score,
       deliverables = EXCLUDED.deliverables,
       missing = EXCLUDED.missing,
       tags = EXCLUDED.tags,
       cost_usd = EXCLUDED.cost_usd`,
    [
      record.runId,
      record.caseId,
      record.judgedAt,
      evaluation.judgeModelId,
      evaluation.overall,
      JSON.stringify(evaluation.deliverables),
      JSON.stringify(evaluation.missing),
      JSON.stringify(evaluation.tags),
      evaluation.costUsd,
    ],
  );
}

interface RunEvalRow {
  run_id: string;
  case_id: string | null;
  judged_at: string | Date;
  judge_model_id: string;
  overall_score: string | number;
  deliverables: DeliverableJudgment[];
  missing: DeliverableName[];
  tags: FailureTag[];
  cost_usd: string | number;
}

/** Fetches one run's judgment for the trace page — `null` for the overwhelming majority of runs, which were never judged. */
export async function getRunEval(
  runId: string,
  db: DbClient = getDb(),
): Promise<RunEvalRecord | null> {
  const { rows } = await db.query<RunEvalRow>(
    `SELECT run_id, case_id, judged_at, judge_model_id, overall_score, deliverables, missing, tags, cost_usd
     FROM run_evals WHERE run_id = $1`,
    [runId],
  );
  const row = rows[0];
  if (!row) return null;

  return {
    runId: row.run_id,
    caseId: row.case_id,
    judgedAt: new Date(row.judged_at).toISOString(),
    evaluation: {
      overall: Number(row.overall_score),
      deliverables: row.deliverables,
      missing: row.missing,
      tags: row.tags,
      judgeModelId: row.judge_model_id,
      costUsd: Number(row.cost_usd),
    },
  };
}
