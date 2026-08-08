import { describe, expect, it } from "vitest";

import type { NodeTrace, RunTrace } from "./record";
import { getRunTrace, recordRunTrace } from "./record";

interface Row {
  run_id: string;
  started_at: string;
  ended_at: string;
  nodes: NodeTrace[];
  total_cost_usd: string;
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

      if (trimmed.startsWith("INSERT INTO run_traces")) {
        const [runId, startedAt, endedAt, nodesJson, totalCostUsd] = params as [
          string,
          string,
          string,
          string,
          number,
        ];
        const existing = rows.find((row) => row.run_id === runId);
        const row: Row = {
          run_id: runId,
          started_at: startedAt,
          ended_at: endedAt,
          nodes: JSON.parse(nodesJson) as NodeTrace[],
          total_cost_usd: String(totalCostUsd),
        };
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

const FIXTURE_NODES: NodeTrace[] = [
  { node: "supervisor", latencyMs: 5, mcpCalls: [] },
  {
    node: "prdAgent",
    latencyMs: 800,
    inputTokens: 120,
    outputTokens: 300,
    mcpCalls: ["search_docs"],
  },
];

const FIXTURE_TRACE: RunTrace = {
  runId: "run-1",
  startedAt: "2026-01-01T00:00:00.000Z",
  endedAt: "2026-01-01T00:00:05.000Z",
  nodes: FIXTURE_NODES,
  totalCostUsd: 0.0021,
};

describe("recordRunTrace", () => {
  it("inserts one row with the run's id, timestamps, node traces (as JSON), and total cost", async () => {
    const db = createFakeDb();

    await recordRunTrace(FIXTURE_TRACE, db);

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toEqual({
      run_id: "run-1",
      started_at: FIXTURE_TRACE.startedAt,
      ended_at: FIXTURE_TRACE.endedAt,
      nodes: FIXTURE_NODES,
      total_cost_usd: "0.0021",
    });
  });

  it("upserts on a repeated run id instead of erroring", async () => {
    const db = createFakeDb();

    await recordRunTrace(FIXTURE_TRACE, db);
    await recordRunTrace({ ...FIXTURE_TRACE, totalCostUsd: 0.5 }, db);

    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].total_cost_usd).toBe("0.5");
  });
});

describe("getRunTrace", () => {
  it("returns null when no trace exists for the given run id", async () => {
    const db = createFakeDb();

    expect(await getRunTrace("missing-run", db)).toBeNull();
  });

  it("returns the trace row parsed back into a RunTrace, with totalCostUsd as a number", async () => {
    const db = createFakeDb();
    await recordRunTrace(FIXTURE_TRACE, db);

    const trace = await getRunTrace("run-1", db);

    expect(trace).toEqual({
      runId: "run-1",
      startedAt: FIXTURE_TRACE.startedAt,
      endedAt: FIXTURE_TRACE.endedAt,
      nodes: FIXTURE_NODES,
      totalCostUsd: 0.0021,
    });
  });
});
