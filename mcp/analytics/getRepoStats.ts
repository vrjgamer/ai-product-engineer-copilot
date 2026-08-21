import type { DbClient } from "../../lib/db/client";

export interface RepoStats {
  repo: string;
  stars: number;
  openIssues: number;
  commitVelocity: number;
  prMergeRate: number;
  fetchedAt: string;
}

export type FetchRepoStats = (
  repo: string,
) => Promise<Omit<RepoStats, "repo" | "fetchedAt">>;

interface CacheRow {
  repo: string;
  stars: number;
  open_issues: number;
  commit_velocity: number;
  pr_merge_rate: number;
  /** `node-postgres` parses TIMESTAMPTZ into a `Date`, even though what this module writes is an ISO string — hence both, normalized on the way out. */
  fetched_at: string | Date;
}

const DEFAULT_TTL_MS = 60 * 60 * 1000;

/**
 * Returns cached `github_stats_cache` data when it's within `ttlMs`,
 * otherwise calls `fetchRepoStats` and refreshes the cache row. `db` and
 * `fetchRepoStats` are injected so this stays testable against a fixture DB
 * and a fake GitHub call (ARCHITECTURE.md §8's mocked-by-default suite).
 */
export async function getRepoStats(
  db: DbClient,
  fetchRepoStats: FetchRepoStats,
  repo: string,
  ttlMs = DEFAULT_TTL_MS,
  now: () => Date = () => new Date(),
): Promise<RepoStats> {
  const { rows } = await db.query<CacheRow>(
    `SELECT repo, stars, open_issues, commit_velocity, pr_merge_rate, fetched_at
     FROM github_stats_cache
     WHERE repo = $1`,
    [repo],
  );
  const cached = rows[0];

  if (cached && now().getTime() - new Date(cached.fetched_at).getTime() < ttlMs) {
    return {
      repo: cached.repo,
      stars: cached.stars,
      openIssues: cached.open_issues,
      commitVelocity: cached.commit_velocity,
      prMergeRate: cached.pr_merge_rate,
      fetchedAt: new Date(cached.fetched_at).toISOString(),
    };
  }

  const fresh = await fetchRepoStats(repo);
  const fetchedAt = now().toISOString();

  await db.query(
    `INSERT INTO github_stats_cache (repo, stars, open_issues, commit_velocity, pr_merge_rate, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (repo) DO UPDATE SET
       stars = EXCLUDED.stars,
       open_issues = EXCLUDED.open_issues,
       commit_velocity = EXCLUDED.commit_velocity,
       pr_merge_rate = EXCLUDED.pr_merge_rate,
       fetched_at = EXCLUDED.fetched_at`,
    [repo, fresh.stars, fresh.openIssues, fresh.commitVelocity, fresh.prMergeRate, fetchedAt],
  );

  return { repo, fetchedAt, ...fresh };
}
