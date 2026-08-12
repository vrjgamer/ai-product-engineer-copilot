import { describe, expect, it } from "vitest";

import type { RunEvaluation } from "./judge";
import { getRunEval, recordRunEval } from "./record";

interface Row {
  run_id: string;
  case_id: string | null;
  judged_at: string;
  judge_model_id: string;
  overall_score: string;
  deliverables: unknown;
  missing: unknown;
  tags: unknown;
  cost_usd: string;
}

function createFakeDb() {
  const rows: Row[] = [];

  return {
    rows,
    async query<T = unknown>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
      const trimmed = text.trim();

      if (trimmed.startsWith("INSERT INTO run_evals")) {
        const [runId, caseId, judgedAt, judgeModelId, overall, deliverables, missing, tags, cost] =
          params as [string, string | null, string, string, number, string, string, string, number];
        const row: Row = {
          run_id: runId,
          case_id: caseId,
          judged_at: judgedAt,
          judge_model_id: judgeModelId,
          overall_score: String(overall),
          deliverables: JSON.parse(deliverables),
          missing: JSON.parse(missing),
          tags: JSON.parse(tags),
          cost_usd: String(cost),
        };
        const existing = rows.find((candidate) => candidate.run_id === runId);
        if (existing) Object.assign(existing, row);
        else rows.push(row);
        return { rows: [] };
      }

      if (trimmed.startsWith("SELECT run_id")) {
        const [runId] = params as [string];
        const match = rows.find((row) => row.run_id === runId);
        return { rows: (match ? [match] : []) as T[] };
      }

      throw new Error(`Unhandled query: ${text}`);
    },
  };
}

const EVALUATION: RunEvaluation = {
  overall: 4.25,
  deliverables: [
    {
      deliverable: "prd",
      judgment: {
        scores: { specificity: 4, coherence: 5, actionability: 4, completeness: 4 },
        tags: ["generic-filler"],
        evidence: "quoted line",
      },
      score: 4.25,
    },
  ],
  missing: ["roadmap"],
  tags: ["generic-filler"],
  judgeModelId: "claude-haiku-4-5",
  costUsd: 0.0012,
};

describe("recordRunEval", () => {
  it("writes one row keyed by run id, with the judgment as JSON", async () => {
    const db = createFakeDb();

    await recordRunEval(
      { runId: "run-1", caseId: "clinic-scheduling", judgedAt: "2026-08-12T00:00:00.000Z", evaluation: EVALUATION },
      db,
    );

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      run_id: "run-1",
      case_id: "clinic-scheduling",
      judge_model_id: "claude-haiku-4-5",
      overall_score: "4.25",
      missing: ["roadmap"],
    });
  });

  it("upserts on a re-judged run instead of erroring", async () => {
    const db = createFakeDb();
    const record = {
      runId: "run-1",
      caseId: null,
      judgedAt: "2026-08-12T00:00:00.000Z",
      evaluation: EVALUATION,
    };

    await recordRunEval(record, db);
    await recordRunEval({ ...record, evaluation: { ...EVALUATION, overall: 2 } }, db);

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].overall_score).toBe("2");
  });
});

describe("getRunEval", () => {
  it("returns null for a run that was never judged — which is nearly all of them", async () => {
    expect(await getRunEval("run-unjudged", createFakeDb())).toBeNull();
  });

  it("round-trips the record, with numeric columns back as numbers", async () => {
    const db = createFakeDb();
    await recordRunEval(
      { runId: "run-1", caseId: "clinic-scheduling", judgedAt: "2026-08-12T00:00:00.000Z", evaluation: EVALUATION },
      db,
    );

    expect(await getRunEval("run-1", db)).toEqual({
      runId: "run-1",
      caseId: "clinic-scheduling",
      judgedAt: "2026-08-12T00:00:00.000Z",
      evaluation: EVALUATION,
    });
  });
});
