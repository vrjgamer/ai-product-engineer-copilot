-- Backs mcp/analytics's get_repo_stats TTL cache (ARCHITECTURE.md §3): keyed
-- by repo, refreshed from the GitHub API only when the cached row is older
-- than the tool's TTL, so repeated demo runs don't hit GitHub's API budget.
CREATE TABLE IF NOT EXISTS github_stats_cache (
  repo TEXT PRIMARY KEY,
  stars INTEGER NOT NULL,
  open_issues INTEGER NOT NULL,
  commit_velocity DOUBLE PRECISION NOT NULL,
  pr_merge_rate DOUBLE PRECISION NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL
);
