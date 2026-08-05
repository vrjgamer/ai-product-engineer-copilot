import type { FetchRepoStats } from "./getRepoStats";

const GITHUB_API_BASE = "https://api.github.com";
const COMMIT_VELOCITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface GithubRepo {
  stargazers_count: number;
  open_issues_count: number;
}

interface GithubCommit {
  commit: { author: { date: string } | null } | null;
}

interface GithubPull {
  merged_at: string | null;
}

function authHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, { headers: authHeaders() });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}

/**
 * The one real `FetchRepoStats` implementation, injected into
 * getRepoStats.ts's cache layer. Commit velocity is commits in the last 7
 * days (from the 100 most recent); PR merge rate is merged/total among the
 * 30 most recently updated closed PRs — both computable from GitHub's
 * default list endpoints without pagination.
 */
export const fetchRepoStatsFromGithub: FetchRepoStats = async (repo) => {
  const [repoData, commits, pulls] = await Promise.all([
    fetchJson<GithubRepo>(`/repos/${repo}`),
    fetchJson<GithubCommit[]>(`/repos/${repo}/commits?per_page=100`),
    fetchJson<GithubPull[]>(
      `/repos/${repo}/pulls?state=closed&per_page=30&sort=updated&direction=desc`,
    ),
  ]);

  const windowStart = Date.now() - COMMIT_VELOCITY_WINDOW_MS;
  const commitVelocity = commits.filter((commit) => {
    const date = commit.commit?.author?.date;
    return date !== undefined && date !== null && new Date(date).getTime() >= windowStart;
  }).length;

  const merged = pulls.filter((pull) => pull.merged_at !== null).length;
  const prMergeRate = pulls.length > 0 ? merged / pulls.length : 0;

  return {
    stars: repoData.stargazers_count,
    openIssues: repoData.open_issues_count,
    commitVelocity,
    prMergeRate,
  };
};
