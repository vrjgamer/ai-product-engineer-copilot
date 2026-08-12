import { describe, expect, it } from "vitest";

import type { AssembledResult } from "../graph/state";
import type { RunResult } from "./record";
import { getRunResult, recordRunResult } from "./record";

interface Row {
  run_id: string;
  request: string;
  created_at: string;
  result: AssembledResult;
}

function createFakeDb(initialRows: Row[] = []) {
  const rows = [...initialRows];
  const calls: { text: string; params: unknown[] }[] = [];

  return {
    rows,
    calls,
    async query<T = unknown>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
      calls.push({ text, params });
      const trimmed = text.trim();

      if (trimmed.startsWith("INSERT INTO run_results")) {
        const [runId, request, createdAt, resultJson] = params as [string, string, string, string];
        const row: Row = {
          run_id: runId,
          request,
          created_at: createdAt,
          result: JSON.parse(resultJson) as AssembledResult,
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

const FIXTURE_RESULT: AssembledResult = {
  prd: { content: "PRD body" },
  userStories: { content: "Stories body" },
  architectureReview: null,
  experimentDesign: { content: "Experiment body" },
  roadmap: { content: "Roadmap body" },
  errors: [{ node: "architectureReviewAgent", message: "model call failed" }],
};

const FIXTURE_RUN: RunResult = {
  runId: "run-1",
  request: "A tool for splitting utility bills between roommates",
  createdAt: "2026-01-01T00:00:05.000Z",
  result: FIXTURE_RESULT,
};

describe("recordRunResult", () => {
  it("inserts one row with the run's id, request, timestamp, and result as JSON", async () => {
    const db = createFakeDb();

    await recordRunResult(FIXTURE_RUN, db);

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toEqual({
      run_id: "run-1",
      request: FIXTURE_RUN.request,
      created_at: FIXTURE_RUN.createdAt,
      result: FIXTURE_RESULT,
    });
  });

  it("upserts on a repeated run id so a retried or resumed run stays one row", async () => {
    const db = createFakeDb();

    await recordRunResult(FIXTURE_RUN, db);
    await recordRunResult(
      { ...FIXTURE_RUN, result: { ...FIXTURE_RESULT, roadmap: { content: "Revised roadmap" } } },
      db,
    );

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].result.roadmap).toEqual({ content: "Revised roadmap" });
  });

  it("stores the errors array, so a degraded run stays visibly degraded when re-read", async () => {
    const db = createFakeDb();

    await recordRunResult(FIXTURE_RUN, db);

    const stored = await getRunResult("run-1", db);
    expect(stored?.result.errors).toEqual([
      { node: "architectureReviewAgent", message: "model call failed" },
    ]);
    expect(stored?.result.architectureReview).toBeNull();
  });
});

describe("getRunResult", () => {
  it("returns null when no result was stored for the given run id", async () => {
    const db = createFakeDb();

    expect(await getRunResult("missing-run", db)).toBeNull();
  });

  it("returns the row parsed back into a RunResult", async () => {
    const db = createFakeDb();
    await recordRunResult(FIXTURE_RUN, db);

    expect(await getRunResult("run-1", db)).toEqual(FIXTURE_RUN);
  });

  it("normalizes a Date created_at to an ISO string, as getRunTrace does", async () => {
    const db = createFakeDb([
      {
        run_id: "run-2",
        request: "anything",
        created_at: new Date("2026-02-02T03:04:05.000Z") as unknown as string,
        result: FIXTURE_RESULT,
      },
    ]);

    const stored = await getRunResult("run-2", db);

    expect(stored?.createdAt).toBe("2026-02-02T03:04:05.000Z");
  });
});
