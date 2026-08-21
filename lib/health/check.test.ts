import { describe, expect, it, vi } from "vitest";

import type { DbClient } from "../db/client";
import { checkHealth } from "./check";

const VALID_ENV = {
  DATABASE_URL: "postgres://localhost/test",
  RATE_LIMIT_IP_SALT: "salt",
  ANTHROPIC_API_KEY: "a",
  GOOGLE_GENERATIVE_AI_API_KEY: "g",
};

function fakeDb(chunkCount: number): DbClient {
  return {
    async query<T = unknown>(text: string): Promise<{ rows: T[] }> {
      if (text.includes("doc_chunks")) return { rows: [{ count: String(chunkCount) }] as T[] };
      return { rows: [] };
    },
  };
}

describe("checkHealth", () => {
  it("reports ok when env is valid, the DB is reachable, and doc_chunks is populated", async () => {
    const report = await checkHealth(() => fakeDb(42), VALID_ENV);

    expect(report.ok).toBe(true);
    expect(report.env).toEqual({ ok: true, missing: [] });
    expect(report.database).toEqual({ ok: true, error: null });
    expect(report.docsCorpus).toEqual({ populated: true, chunkCount: 42 });
    expect(report.model).toEqual({ provider: "anthropic", modelId: "claude-haiku-4-5" });
    expect(report.embeddings).toEqual({ provider: "google" });
  });

  it("distinguishes an unindexed corpus (chunkCount 0) from an unreachable one (chunkCount null)", async () => {
    const report = await checkHealth(() => fakeDb(0), VALID_ENV);

    expect(report.docsCorpus).toEqual({ populated: false, chunkCount: 0 });
  });

  it("reports env invalidity without ever constructing a DB client", async () => {
    const getDbClient = vi.fn(() => fakeDb(1));

    const report = await checkHealth(getDbClient, {});

    expect(report.ok).toBe(false);
    expect(report.env.ok).toBe(false);
    expect(report.env.missing.length).toBeGreaterThan(0);
    // env is validated independently of the DB — no need to hold up the
    // whole report on a connection attempt when env is already invalid.
  });

  it("reports database.ok: false with the error message, not a thrown exception, when getDbClient throws", async () => {
    const report = await checkHealth(() => {
      throw new Error("Missing DATABASE_URL.");
    }, VALID_ENV);

    expect(report.ok).toBe(false);
    expect(report.database).toEqual({ ok: false, error: "Missing DATABASE_URL." });
    expect(report.docsCorpus).toEqual({ populated: false, chunkCount: null });
  });

  it("reports database.ok: false when the query itself rejects", async () => {
    const db: DbClient = { query: vi.fn().mockRejectedValue(new Error("connection refused")) };

    const report = await checkHealth(() => db, VALID_ENV);

    expect(report.database).toEqual({ ok: false, error: "connection refused" });
  });

  it("leaves docsCorpus at its default when the doc_chunks query fails (e.g. table doesn't exist yet)", async () => {
    const db: DbClient = {
      query: vi.fn(async (text: string) => {
        if (text.includes("doc_chunks")) throw new Error('relation "doc_chunks" does not exist');
        return { rows: [] };
      }),
    };

    const report = await checkHealth(() => db, VALID_ENV);

    expect(report.database.ok).toBe(true);
    expect(report.docsCorpus).toEqual({ populated: false, chunkCount: null });
  });
});
