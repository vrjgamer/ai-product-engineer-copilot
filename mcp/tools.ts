import { createAnalyticsServer, getDefaultDemoRepo } from "./analytics/server";
import type { RepoStats } from "./analytics/getRepoStats";
import { callMcpTool } from "./client";
import { createDocsStoreServer } from "./docs-store/server";
import type { SearchDocsResult } from "./docs-store/searchDocs";

/** The graph's only entry point into docs-store — see mcp/client.ts for the real MCP round trip underneath. */
export async function searchDocsTool(query: string): Promise<SearchDocsResult> {
  return callMcpTool<SearchDocsResult>(createDocsStoreServer(), "search_docs", { query });
}

/** The graph's only entry point into analytics — see mcp/client.ts for the real MCP round trip underneath. */
export async function getRepoStatsTool(repo: string = getDefaultDemoRepo()): Promise<RepoStats> {
  return callMcpTool<RepoStats>(createAnalyticsServer(), "get_repo_stats", { repo });
}

export function formatDocsContext(result: SearchDocsResult): string {
  if (result.passages.length === 0) return "";
  return `Relevant docs:\n${result.passages.map((passage) => passage.text).join("\n")}`;
}

export function formatRepoStats(stats: RepoStats): string {
  return (
    `GitHub stats for ${stats.repo}: ${stats.stars} stars, ${stats.openIssues} open issues, ` +
    `${stats.commitVelocity} commits in the last 7 days, ` +
    `${Math.round(stats.prMergeRate * 100)}% PR merge rate.`
  );
}
