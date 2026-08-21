import { describe, expect, it, vi } from "vitest";

import { getRepoStats } from "./getRepoStats";

interface FixtureRow {
  repo: string;
  stars: number;
  open_issues: number;
  commit_velocity: number;
  pr_merge_rate: number;
  /**
   * `string | Date` because that's what the real driver does: `node-postgres`
   * parses a `TIMESTAMPTZ` column into a `Date`, while the value this module
   * *writes* is an ISO string. A fixture typed `string` only is better-behaved
   * than the real database, which is how the cache-hit path shipped returning a
   * `Date` through a `z.string()` MCP output schema.
   */
  fetched_at: string | Date;
}

function createFakeDb(initialRows: FixtureRow[] = []) {
  const rows = [...initialRows];
  return {
    rows,
    async query<T = unknown>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
      const trimmed = text.trim();

      if (trimmed.startsWith("SELECT repo")) {
        const [repo] = params as [string];
        return { rows: rows.filter((row) => row.repo === repo) as T[] };
      }

      if (trimmed.startsWith("INSERT INTO github_stats_cache")) {
        const [repo, stars, openIssues, commitVelocity, prMergeRate, fetchedAt] = params as [
          string,
          number,
          number,
          number,
          number,
          string,
        ];
        const row: FixtureRow = {
          repo,
          stars,
          open_issues: openIssues,
          commit_velocity: commitVelocity,
          pr_merge_rate: prMergeRate,
          fetched_at: fetchedAt,
        };
        const index = rows.findIndex((r) => r.repo === repo);
        if (index >= 0) rows[index] = row;
        else rows.push(row);
        return { rows: [] };
      }

      throw new Error(`Unhandled query: ${text}`);
    },
  };
}

const TTL_MS = 60 * 60 * 1000;

describe("getRepoStats", () => {
  it("returns cached data without calling the GitHub API when the cache row is within TTL", async () => {
    const db = createFakeDb([
      {
        repo: "acme/demo",
        stars: 42,
        open_issues: 3,
        commit_velocity: 7,
        pr_merge_rate: 0.9,
        fetched_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const fetchRepoStats = vi.fn();

    const stats = await getRepoStats(
      db,
      fetchRepoStats,
      "acme/demo",
      TTL_MS,
      () => new Date("2026-01-01T00:30:00.000Z"),
    );

    expect(fetchRepoStats).not.toHaveBeenCalled();
    expect(stats).toEqual({
      repo: "acme/demo",
      stars: 42,
      openIssues: 3,
      commitVelocity: 7,
      prMergeRate: 0.9,
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("normalizes a Date from the driver into an ISO string on the cache-hit path", async () => {
    // What `node-postgres` actually hands back for a TIMESTAMPTZ column. The
    // MCP output schema (mcp/analytics/server.ts) declares `fetchedAt` as
    // `z.string()`, so returning the Date through unvalidated every call
    // within the TTL — i.e. all but the first — with a -32602 output
    // validation error, while the fresh path's `.toISOString()` stayed fine.
    const db = createFakeDb([
      {
        repo: "acme/demo",
        stars: 42,
        open_issues: 3,
        commit_velocity: 7,
        pr_merge_rate: 0.9,
        fetched_at: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const stats = await getRepoStats(
      db,
      vi.fn(),
      "acme/demo",
      TTL_MS,
      () => new Date("2026-01-01T00:30:00.000Z"),
    );

    expect(stats.fetchedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(typeof stats.fetchedAt).toBe("string");
  });

  it("calls the GitHub API and refreshes the cache when the cached row has expired", async () => {
    const db = createFakeDb([
      {
        repo: "acme/demo",
        stars: 42,
        open_issues: 3,
        commit_velocity: 7,
        pr_merge_rate: 0.9,
        fetched_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const fetchRepoStats = vi.fn(async () => ({
      stars: 50,
      openIssues: 1,
      commitVelocity: 9,
      prMergeRate: 1,
    }));

    const stats = await getRepoStats(
      db,
      fetchRepoStats,
      "acme/demo",
      TTL_MS,
      () => new Date("2026-01-01T02:00:00.000Z"),
    );

    expect(fetchRepoStats).toHaveBeenCalledWith("acme/demo");
    expect(stats.stars).toBe(50);
    expect(db.rows.find((row) => row.repo === "acme/demo")?.stars).toBe(50);
  });

  it("calls the GitHub API when there is no cached row", async () => {
    const db = createFakeDb();
    const fetchRepoStats = vi.fn(async () => ({
      stars: 1,
      openIssues: 0,
      commitVelocity: 0,
      prMergeRate: 0,
    }));

    const stats = await getRepoStats(db, fetchRepoStats, "acme/new-repo", TTL_MS);

    expect(fetchRepoStats).toHaveBeenCalledWith("acme/new-repo");
    expect(stats.repo).toBe("acme/new-repo");
  });
});
